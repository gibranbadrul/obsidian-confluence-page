import type { TFile } from 'obsidian';
import { t } from './i18n';

export interface LogEntry {
	timestamp: Date;
	level: 'info' | 'warn' | 'error';
	message: string;
	details?: string;
}

export enum PublishStatus {
	Idle = 'idle',
	Publishing = 'publishing',
	Success = 'success',
	Failed = 'failed',
}

/**
 * Label shown in the status-bar pill. Evaluated lazily via getters so the
 * active locale (resolved once at i18n load time) is applied at read time.
 */
export const PublishStatusText: Record<PublishStatus, string> = {
	get [PublishStatus.Idle]() { return t('status.idle'); },
	get [PublishStatus.Publishing]() { return t('status.publishing'); },
	get [PublishStatus.Success]() { return t('status.success'); },
	get [PublishStatus.Failed]() { return t('status.failed'); },
};

/** Confluence publishing metadata for one note, read from frontmatter. */
export interface NoteBinding {
	/** confluence_url. Empty string means the page has not been created yet and parentUrl should be used for createPage. */
	url: string;
	pageId: string;
	/** confluence_parent_url. Used only when url is empty to choose the parent page for the new page. */
	parentUrl?: string;
	lastPublished?: string;
	lastHash?: string;
	/** confluence_attachments. pageId -> filename -> { hash, id }. */
	attachments?: AttachmentCache;
}

export interface AttachmentRecord {
	hash: string;
	id: string;
}

/** pageId -> filename -> { hash, id } attachment cache persisted in note frontmatter. */
export type AttachmentCache = Record<string, Record<string, AttachmentRecord>>;

/** Local attachment reference extracted from Markdown. */
export interface AttachmentRef {
	/** Source Markdown snippet inside Obsidian. */
	rawMatch: string;
	/** Link or path text. */
	linkpath: string;
	/** Optional alt text. */
	alt: string;
	/** Actual file resolved by Obsidian. Null when the link is broken. */
	tfile: TFile | null;
	/** Display filename used as the Confluence attachment filename. */
	filename: string;
}

/** Single-file publish result. */
export interface FilePublishResult {
	path: string;
	skipped: boolean;
	success: boolean;
	error?: string;
	uploadedAttachments?: number;
	skippedAttachments?: number;
}

/** Batch publish summary. */
export interface BatchPublishResult {
	total: number;
	updated: number;
	skipped: number;
	failed: number;
	files: FilePublishResult[];
}
