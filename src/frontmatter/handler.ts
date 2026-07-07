import type { App, TFile } from 'obsidian';
import { parsePageIdFromUrl } from '../confluence/urlParser';
import { type NoteBinding, type AttachmentCache, type AttachmentRecord } from '../types';

const FIELD = {
	URL: 'confluence_url',
	PARENT_URL: 'confluence_parent_url',
	PAGE_ID: 'confluence_page_id',
	CUSTOM_TITLE: 'confluence_title',
	LAST_PUBLISHED: 'confluence_last_published_at',
	LAST_HASH: 'confluence_content_hash',
	ATTACHMENTS: 'confluence_attachments',
} as const;

const LEGACY_FIELD = {
	LAST_SYNCED: 'confluence_last_published',
	LAST_HASH: 'confluence_last_hash',
} as const;

/**
 * Obsidian types frontmatter as `any`. This module only reads/writes known fields and narrows it to `Record<string, unknown>`.
 */
export type Frontmatter = Record<string, unknown>;

export interface BindingPatch {
	url?: string;
	pageId?: string;
	lastPublished?: string;
	lastHash?: string;
	attachments?: AttachmentCache;
}

/**
 * Reads Confluence publishing metadata from frontmatter.
 *
 * Publisher metadata is intentionally snake_case so notes stay easy to read and edit manually.
 */
export function readBindingFromCache(app: App, file: TFile, urlKey: string = FIELD.URL): NoteBinding | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	if (!fm) return null;

	const rawUrl = readStringField(fm, urlKey, FIELD.URL);
	const rawParent = readStringField(fm, FIELD.PARENT_URL);
	const url = rawUrl.trim();
	const parentUrl = rawParent.trim();

	// A note is managed by this plugin only when a page URL or parent page URL is present.
	if (!url && !parentUrl) return null;

	const rawPageId = readStringField(fm, FIELD.PAGE_ID);
	const targetPageId = rawPageId || (url ? parsePageIdFromUrl(url) ?? '' : '');
	const rawAttachments = readFirstExistingField(fm, FIELD.ATTACHMENTS);
	const attachments = normalizeAttachmentCache(rawAttachments, targetPageId);
	const rawLastPublished = readStringField(fm, FIELD.LAST_PUBLISHED, LEGACY_FIELD.LAST_SYNCED);
	const rawLastHash = readStringField(fm, FIELD.LAST_HASH, LEGACY_FIELD.LAST_HASH);

	return {
		url,
		parentUrl: parentUrl || undefined,
		pageId: rawPageId,
		lastPublished: rawLastPublished || undefined,
		lastHash: rawLastHash || undefined,
		attachments,
	};
}

/** Writes publishing metadata back to frontmatter after a successful publish. */
export async function writeBinding(app: App, file: TFile, patch: BindingPatch): Promise<void> {
	await app.fileManager.processFrontMatter(file, (raw: unknown) => {
		const fm = raw as Frontmatter;
		if (patch.url !== undefined) fm[FIELD.URL] = patch.url;
		if (patch.pageId !== undefined) fm[FIELD.PAGE_ID] = patch.pageId;
		if (patch.lastPublished !== undefined) fm[FIELD.LAST_PUBLISHED] = patch.lastPublished;
		if (patch.lastHash !== undefined) fm[FIELD.LAST_HASH] = patch.lastHash;
		if (patch.attachments !== undefined) fm[FIELD.ATTACHMENTS] = patch.attachments;
	});
}

/** Inserts template frontmatter fields when the note is not already bound to Confluence. */
export async function insertTemplateFrontmatter(app: App, file: TFile, placeholderUrl = ''): Promise<boolean> {
	let inserted = false;
	await app.fileManager.processFrontMatter(file, (raw: unknown) => {
		const fm = raw as Frontmatter;
		const existingUrl = readStringField(fm, FIELD.URL);
		const existingParentUrl = readStringField(fm, FIELD.PARENT_URL);
		if (existingUrl.trim() || existingParentUrl.trim()) return;

		fm[FIELD.URL] = placeholderUrl;
		fm[FIELD.PARENT_URL] = '';
		fm[FIELD.PAGE_ID] = '';
		fm[FIELD.CUSTOM_TITLE] = '';
		fm[FIELD.LAST_PUBLISHED] = '';
		fm[FIELD.LAST_HASH] = '';
		inserted = true;
	});
	return inserted;
}

export function hasPublishingBinding(frontmatter: Frontmatter, urlKey: string = FIELD.URL): boolean {
	const url = readStringField(frontmatter, urlKey, FIELD.URL);
	const parentUrl = readStringField(frontmatter, FIELD.PARENT_URL);
	return url.trim().length > 0 || parentUrl.trim().length > 0;
}

function readStringField(fm: Frontmatter, ...keys: string[]): string {
	let firstString = '';

	for (const key of keys) {
		const value = fm[key];
		if (typeof value !== 'string') continue;
		if (!firstString) firstString = value;
		if (value.trim()) return value;
	}

	return firstString;
}

function readFirstExistingField(fm: Frontmatter, ...keys: string[]): unknown {
	for (const key of keys) {
		const value = fm[key];
		if (value !== undefined && value !== null) return value;
	}
	return undefined;
}

function normalizeAttachmentCache(value: unknown, targetPageId: string): AttachmentCache | undefined {
	if (isNestedAttachmentMap(value)) return value;
	if (isFlatAttachmentMap(value) && targetPageId) return { [targetPageId]: value };
	return undefined;
}

function isNestedAttachmentMap(value: unknown): value is AttachmentCache {
	if (!value || typeof value !== 'object') return false;
	for (const pageBucket of Object.values(value as Record<string, unknown>)) {
		if (!isFlatAttachmentMap(pageBucket)) return false;
	}
	return true;
}

function isFlatAttachmentMap(value: unknown): value is Record<string, AttachmentRecord> {
	if (!value || typeof value !== 'object') return false;
	for (const entry of Object.values(value as Record<string, unknown>)) {
		if (!entry || typeof entry !== 'object') return false;
		const record = entry as Record<string, unknown>;
		if (typeof record.hash !== 'string' || typeof record.id !== 'string') return false;
	}
	return true;
}

export const FrontmatterFields = FIELD;
export const LegacyFrontmatterFields = LEGACY_FIELD;
