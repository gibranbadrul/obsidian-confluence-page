import type { App, TFile } from 'obsidian';
import { type ConfluenceApi, ConfluenceApiError } from '../confluence/api';
import { parsePageIdFromUrl } from '../confluence/urlParser';
import { MarkdownConverter, type ConvertContext } from '../confluence/markdownConverter';
import { AttachmentUploader } from '../confluence/attachmentUploader';
import { MermaidRenderer } from '../confluence/mermaidRenderer';
import { PlantUmlRenderer } from '../confluence/plantUmlRenderer';
import { readBindingFromCache, writeBinding } from '../frontmatter/handler';
import { scanPublishableNotes } from './noteScanner';
import { type Logger } from '../utils/logger';
import { type ConfluencePagePublisherSettings } from '../settings';
import { type AttachmentCache, type AttachmentRecord, type BatchPublishResult, type FilePublishResult, type NoteBinding } from '../types';

export interface PublishEngineDeps {
	app: App;
	settings: ConfluencePagePublisherSettings;
	logger: Logger;
	api: ConfluenceApi;
}

/**
 * Coordinates the full publish pipeline:
 * scan files, upload attachments, render diagrams, convert Markdown, update Confluence,
 * and write publishing metadata back to frontmatter.
 *
 * The `busy` flag prevents overlapping publish operations from running at the same time.
 */
export class PublishEngine {
	private converter: MarkdownConverter;
	private uploader: AttachmentUploader;
	private mermaid: MermaidRenderer | null = null;
	private plantUml: PlantUmlRenderer | null = null;
	private busy = false;

	constructor(private deps: PublishEngineDeps) {
		this.converter = new MarkdownConverter(deps.app);
		this.uploader = new AttachmentUploader(deps.app, deps.api, deps.logger, {
			maxSizeBytes: Math.max(1, deps.settings.maxAttachmentSizeMB) * 1024 * 1024,
		});
		if (deps.settings.renderMermaidToPng) {
			this.mermaid = new MermaidRenderer(deps.settings.mermaidRenderUrl, deps.logger);
		}
		if (deps.settings.renderPlantUmlToPng) {
			this.plantUml = new PlantUmlRenderer(deps.settings.plantUmlServerUrl, deps.logger);
		}
	}

	/** Scans the vault and publishes every bound note. */
	async publishAll(): Promise<BatchPublishResult | null> {
		const files = scanPublishableNotes(this.deps.app, {
			frontmatterKey: this.deps.settings.frontmatterKey,
			scanFolders: this.deps.settings.scanFolders,
			ignorePatterns: this.deps.settings.ignorePatterns,
		});
		this.deps.logger.info(`Found ${files.length} publishable notes`);
		return this.publishFiles(files);
	}

	/** Publishes a given list of files. Used by publishAll, publishFolder, and future selection-based publish flows. */
	async publishFiles(files: TFile[]): Promise<BatchPublishResult | null> {
		if (this.busy) {
			this.deps.logger.warn('A publish task is already running; skipping this request.');
			return null;
		}
		this.busy = true;
		try {
			const result: BatchPublishResult = { total: files.length, updated: 0, skipped: 0, failed: 0, files: [] };
			for (const file of files) {
				const r = await this.publishFileInternal(file);
				result.files.push(r);
				if (r.skipped) result.skipped += 1;
				else if (r.success) result.updated += 1;
				else result.failed += 1;
			}
			this.deps.logger.info(
				`Publish finished: updated ${result.updated} / skipped ${result.skipped} / failed ${result.failed}`,
			);
			this.deps.logger.recordPublishTime();
			return result;
		} finally {
			this.busy = false;
		}
	}

	/** Publishes a single file. */
	async publishOne(file: TFile): Promise<FilePublishResult | null> {
		if (this.busy) {
			this.deps.logger.warn('A publish task is already running; skipping this request.');
			return null;
		}
		this.busy = true;
		try {
			const r = await this.publishFileInternal(file);
			this.deps.logger.recordPublishTime();
			return r;
		} finally {
			this.busy = false;
		}
	}

	private async publishFileInternal(file: TFile): Promise<FilePublishResult> {
		const path = file.path;
		try {
			const binding = readBindingFromCache(this.deps.app, file, this.deps.settings.frontmatterKey);
			if (!binding) {
				this.deps.logger.warn(`Publish skipped: ${path}`, 'Missing confluence_url / confluence_parent_url frontmatter');
				return { path, skipped: true, success: false, error: 'Missing confluence_url / confluence_parent_url frontmatter' };
			}
			const pageTitle = resolveConfluencePageTitle(
				this.deps.app,
				file,
				this.deps.settings.confluencePageTitlePropertyKey,
			);

			// Resolve the target page. Existing pages use confluence_url/page_id; new pages use confluence_parent_url.
			let pageId = binding.pageId || (binding.url ? parsePageIdFromUrl(binding.url) ?? '' : '');
			// The template placeholder may contain pageId=0. Treat it as unresolved.
			if (pageId === '0') pageId = '';
			this.deps.logger.info(
				`Publish started: ${path}`,
				`title="${pageTitle}" pageId=${pageId || '<new-child>'}`,
			);
			let createdNewPage = false;

			if (!pageId) {
				if (!binding.parentUrl) {
					this.deps.logger.warn(`Publish failed before request: ${path}`, `Cannot parse pageId from URL: ${binding.url}`);
					return { path, skipped: false, success: false, error: `Cannot parse pageId from URL: ${binding.url}` };
				}
				const parentId = parsePageIdFromUrl(binding.parentUrl);
				if (!parentId) {
					this.deps.logger.warn(`Publish failed before request: ${path}`, `Cannot parse pageId from parent URL: ${binding.parentUrl}`);
					return { path, skipped: false, success: false, error: `Cannot parse pageId from parent URL: ${binding.parentUrl}` };
				}

				this.deps.logger.info(`Fetching parent Confluence page metadata: ${path}`, `parentId=${parentId}`);
				const parent = await this.deps.api.getPage(parentId);
				if (!parent.spaceKey) {
					this.deps.logger.warn(`Publish failed before create: ${path}`, `Parent page is missing spaceKey: ${binding.parentUrl}`);
					return { path, skipped: false, success: false, error: `Parent page is missing spaceKey: ${binding.parentUrl}` };
				}

				this.deps.logger.info(`Creating child page: ${pageTitle} (parent=${parentId}, space=${parent.spaceKey})`);
				const created = await this.deps.api.createPage({
					spaceKey: parent.spaceKey,
					parentId,
					title: pageTitle,
					storageXhtml: '<p>(publishing…)</p>',
				});
				pageId = created.id;
				createdNewPage = true;

				// Write page ID immediately so a later failure does not create duplicate pages on the next publish.
				await writeBinding(this.deps.app, file, { url: created.webUrl, pageId });
				this.deps.logger.info(`Created child page ${created.id}: ${created.webUrl}`);
			}

			const markdown = await this.deps.app.vault.cachedRead(file);
			const contentHash = await this.converter.computeContentHash(markdown, pageTitle);
			const previousAttachments = this.getPreviousAttachments(pageId, binding);
			this.deps.logger.info(
				`Content hash resolved: ${path}`,
				`pageId=${pageId} previous=${binding.lastHash || '<empty>'} current=${contentHash}`,
			);

			// Newly created placeholder pages must be updated once even when the content hash matches.
			if (!createdNewPage && binding.lastHash === contentHash && binding.pageId === pageId) {
				if (binding.attachments) {
					await writeBinding(this.deps.app, file, { pageId, attachments: binding.attachments });
				}
				this.deps.logger.info(
					`Skipped unchanged note: ${path}`,
					`pageId=${pageId} contentHash=${contentHash}`,
				);
				return { path, skipped: true, success: true };
			}

			const refs = await this.converter.extractReferences(markdown, path);
			this.deps.logger.info(
				`References extracted: ${path}`,
				`attachments=${refs.attachments.length} mermaid=${refs.mermaid.length} plantuml=${refs.plantUml.length}`,
			);

			const attachmentResult = this.deps.settings.uploadAttachments
				? await this.uploader.uploadReferencedAttachments(pageId, refs.attachments, previousAttachments)
				: { map: {} as Record<string, AttachmentRecord>, uploaded: 0, skipped: 0, failed: 0 };

			const mermaidFilenameByHash = new Map<string, string>();
			const mermaidRecords: Record<string, AttachmentRecord> = {};
			if (this.mermaid && refs.mermaid.length > 0) {
				const rendered = await this.mermaid.renderAll(refs.mermaid);
				for (const r of rendered) {
					if (!r) continue;
					const rec = await this.uploader.uploadBytes(pageId, r.block.filename, r.png, previousAttachments);
					if (rec) {
						mermaidFilenameByHash.set(r.block.hash, r.block.filename);
						mermaidRecords[r.block.filename] = rec;
					}
				}
			}

			const plantUmlFilenameByHash = new Map<string, string>();
			const plantUmlRecords: Record<string, AttachmentRecord> = {};
			if (this.plantUml && refs.plantUml.length > 0) {
				const rendered = await this.plantUml.renderAll(refs.plantUml);
				for (const r of rendered) {
					if (!r) continue;
					const rec = await this.uploader.uploadBytes(pageId, r.block.filename, r.png, previousAttachments);
					if (rec) {
						plantUmlFilenameByHash.set(r.block.hash, r.block.filename);
						plantUmlRecords[r.block.filename] = rec;
					}
				}
			}

			this.deps.logger.info(`Fetching Confluence page metadata: ${path}`, `pageId=${pageId}`);
			const page = await this.deps.api.getPage(pageId);

			const allAttachedFilenames = new Set<string>([
				...Object.keys(attachmentResult.map),
				...Object.keys(mermaidRecords),
				...Object.keys(plantUmlRecords),
			]);
			const ctx: ConvertContext = {
				attachedFilenames: allAttachedFilenames,
				mermaidFilenameByHash,
				plantUmlFilenameByHash,
				renderMermaidToPng: this.deps.settings.renderMermaidToPng,
				renderPlantUmlToPng: this.deps.settings.renderPlantUmlToPng,
			};
			const storageXhtml = await this.converter.convert(markdown, path, ctx);

			// The title is resolved from the configured frontmatter property, then falls back to the note filename.
			try {
				this.deps.logger.info(`Updating Confluence page: ${path}`, `pageId=${pageId} version=${page.version + 1}`);
				await this.deps.api.updatePage(pageId, {
					title: pageTitle,
					storageXhtml,
					newVersion: page.version + 1,
				});
				this.deps.logger.info(`Confluence page updated: ${path}`, `pageId=${pageId} version=${page.version + 1}`);
			} catch (e) {
				if (e instanceof ConfluenceApiError && e.code === 'version_conflict') {
					this.deps.logger.warn(`Version conflict; refetching page before retry: ${path}`, `pageId=${pageId}`);
					const refreshed = await this.deps.api.getPage(pageId);
					this.deps.logger.info(`Retrying Confluence page update: ${path}`, `pageId=${pageId} version=${refreshed.version + 1}`);
					await this.deps.api.updatePage(pageId, {
						title: pageTitle,
						storageXhtml,
						newVersion: refreshed.version + 1,
					});
					this.deps.logger.info(`Confluence page updated after retry: ${path}`, `pageId=${pageId} version=${refreshed.version + 1}`);
				} else {
					throw e;
				}
			}

			const mergedAttachments: Record<string, AttachmentRecord> = {
				...previousAttachments,
				...attachmentResult.map,
				...mermaidRecords,
				...plantUmlRecords,
			};
			const stillReferenced = new Set<string>(allAttachedFilenames);
			for (const k of Object.keys(mergedAttachments)) {
				if (!stillReferenced.has(k)) delete mergedAttachments[k];
			}

			const nextAttachmentCache = cloneAttachmentCache(binding.attachments);
			if (Object.keys(mergedAttachments).length > 0) {
				nextAttachmentCache[pageId] = mergedAttachments;
			} else {
				delete nextAttachmentCache[pageId];
			}

			await writeBinding(this.deps.app, file, {
				pageId,
				lastPublished: new Date().toISOString(),
				lastHash: contentHash,
				attachments: nextAttachmentCache,
			});

			this.deps.logger.info(
				`Published: ${path}`,
				`attachments uploaded ${attachmentResult.uploaded} / reused ${attachmentResult.skipped} / failed ${attachmentResult.failed}`,
			);
			return {
				path,
				skipped: false,
				success: true,
				uploadedAttachments: attachmentResult.uploaded,
				skippedAttachments: attachmentResult.skipped,
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.deps.logger.error(`Publish failed: ${path}`, msg);
			return { path, skipped: false, success: false, error: msg };
		}
	}

	private getPreviousAttachments(pageId: string, binding: NoteBinding): Record<string, AttachmentRecord> {
		return { ...(binding.attachments?.[pageId] ?? {}) };
	}

	/** Rebuild renderer and uploader instances after settings change. */
	rebuildRenderers(): void {
		this.mermaid = this.deps.settings.renderMermaidToPng ? new MermaidRenderer(this.deps.settings.mermaidRenderUrl, this.deps.logger) : null;
		this.plantUml = this.deps.settings.renderPlantUmlToPng
			? new PlantUmlRenderer(this.deps.settings.plantUmlServerUrl, this.deps.logger)
			: null;
		this.uploader = new AttachmentUploader(this.deps.app, this.deps.api, this.deps.logger, {
			maxSizeBytes: Math.max(1, this.deps.settings.maxAttachmentSizeMB) * 1024 * 1024,
		});
	}
}


function cloneAttachmentCache(cache: AttachmentCache | undefined): AttachmentCache {
	const cloned: AttachmentCache = {};
	for (const [pageId, entries] of Object.entries(cache ?? {})) {
		cloned[pageId] = { ...entries };
	}
	return cloned;
}
function resolveConfluencePageTitle(app: App, file: TFile, propertyKey: string): string {
	const normalizedPropertyKey = propertyKey.trim();
	if (normalizedPropertyKey) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const title = frontmatterValueToTitle(frontmatter?.[normalizedPropertyKey]);
		if (title) return title;
	}
	return file.basename;
}

function frontmatterValueToTitle(value: unknown): string | null {
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized || null;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			const title = frontmatterValueToTitle(item);
			if (title) return title;
		}
	}
	return null;
}

export type { NoteBinding };
