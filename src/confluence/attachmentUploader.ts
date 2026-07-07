import type { App, TFile } from 'obsidian';
import { type ConfluenceApi } from './api';
import { type AttachmentRecord, type AttachmentRef } from '../types';
import { sha1Hex } from '../utils/hash';
import { type Logger } from '../utils/logger';

export interface AttachmentUploadOptions {
	maxSizeBytes: number;
}

export interface AttachmentUploadResult {
	/** filename -> final Confluence attachment record */
	map: Record<string, AttachmentRecord>;
	uploaded: number;
	skipped: number;
	failed: number;
}

/** Known extension -> MIME. Confluence accepts generic MIME, but explicit values avoid bad guesses. */
const MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	webp: 'image/webp',
	bmp: 'image/bmp',
	pdf: 'application/pdf',
	zip: 'application/zip',
	json: 'application/json',
	txt: 'text/plain',
	md: 'text/markdown',
};

export class AttachmentUploader {
	constructor(
		private app: App,
		private api: ConfluenceApi,
		private logger: Logger,
		private opts: AttachmentUploadOptions,
	) {}

	/**
	 * Publishes a list of attachments to a target page.
	 *
	 * Flow for each ref:
	 *  1. Read binary content and calculate sha1.
	 *  2. Compare against previous[filename]; if hash matches, reuse and skip upload.
	 *  3. If changed, check Confluence for an existing attachment and decide create vs updateData.
	 *  4. Add successful records to the new map. Failed uploads are retried next time.
	 *
	 * Confluence attachments are addressed by filename, so filenames must be unique.
	 */
	async uploadReferencedAttachments(
		pageId: string,
		refs: AttachmentRef[],
		previous: Record<string, AttachmentRecord> = {},
	): Promise<AttachmentUploadResult> {
		const result: AttachmentUploadResult = { map: {}, uploaded: 0, skipped: 0, failed: 0 };
		const seen = new Set<string>();

		for (const ref of refs) {
			if (!ref.tfile) {
				this.logger.warn(`Attachment reference cannot be resolved: ${ref.linkpath}`);
				result.failed += 1;
				continue;
			}
			const filename = ref.filename;
			if (seen.has(filename)) continue;
			seen.add(filename);

			try {
				const bytes = await this.app.vault.readBinary(ref.tfile);
				if (bytes.byteLength > this.opts.maxSizeBytes) {
					this.logger.warn(
						`Skipping oversized attachment: ${filename}`,
						`${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB > ${(this.opts.maxSizeBytes / 1024 / 1024).toFixed(2)} MB`,
					);
					result.skipped += 1;
					continue;
				}

				const hash = await sha1Hex(bytes);
				const prev = previous[filename];
				if (prev && prev.hash === hash) {
					result.map[filename] = prev;
					result.skipped += 1;
					continue;
				}

				const mime = guessMime(filename);
				const record = await this.upload(pageId, filename, bytes, mime, prev?.id);
				result.map[filename] = { hash, id: record.id };
				result.uploaded += 1;
				this.logger.info(`Attachment uploaded: ${filename}`, `${(bytes.byteLength / 1024).toFixed(1)} KB`);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.error(`Attachment upload failed: ${filename}`, msg);
				result.failed += 1;
			}
		}

		return result;
	}

	/**
	 * Publishes an in-memory binary attachment. Used by Mermaid/PlantUML renderers where no TFile exists.
	 */
	async uploadBytes(
		pageId: string,
		filename: string,
		data: ArrayBuffer,
		previous: Record<string, AttachmentRecord> = {},
	): Promise<AttachmentRecord | null> {
		try {
			const hash = await sha1Hex(data);
			const prev = previous[filename];
			if (prev && prev.hash === hash) {
				this.logger.info(`Diagram attachment reused: ${filename}`);
				return prev;
			}

			this.logger.info(`Diagram attachment upload started: ${filename}`);
			const mime = guessMime(filename);
			const record = await this.upload(pageId, filename, data, mime, prev?.id);
			this.logger.info(`Diagram attachment uploaded: ${filename}`);
			return { hash, id: record.id };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.logger.error(`Diagram attachment upload failed: ${filename}`, msg);
			return null;
		}
	}

	private async upload(
		pageId: string,
		filename: string,
		data: ArrayBuffer,
		mime: string,
		knownAttachmentId: string | undefined,
	): Promise<{ id: string }> {
		// Prefer cached attachmentId and updateData; if it fails, fall back to find + create.
		if (knownAttachmentId) {
			try {
				const r = await this.api.updateAttachment(pageId, knownAttachmentId, filename, data, mime);
				return { id: r.id };
			} catch {
				// The attachment may have been deleted in Confluence. Continue through find/create path.
			}
		}
		const existing = await this.api.findAttachmentByFilename(pageId, filename);
		if (existing) {
			const r = await this.api.updateAttachment(pageId, existing.id, filename, data, mime);
			return { id: r.id };
		}
		const r = await this.api.createAttachment(pageId, filename, data, mime);
		return { id: r.id };
	}
}

function guessMime(filename: string): string {
	const idx = filename.lastIndexOf('.');
	if (idx < 0) return 'application/octet-stream';
	const ext = filename.slice(idx + 1).toLowerCase();
	return MIME[ext] ?? 'application/octet-stream';
}

/** Helper: resolve a link to TFile through Obsidian metadataCache, then fall back to filename search across the vault. */
export function resolveAttachmentFile(app: App, linkpath: string, sourcePath: string): TFile | null {
	const dest = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	if (dest) return dest;
	const base = linkpath.split('/').pop() ?? linkpath;
	const all = app.vault.getFiles();
	return all.find((f) => f.name === base) ?? null;
}
