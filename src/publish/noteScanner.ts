import type { App, TFile } from 'obsidian';
import { FrontmatterFields, type Frontmatter } from '../frontmatter/handler';

export interface ScanOptions {
	frontmatterKey: string;
	scanFolders: string[];
	ignorePatterns: string[];
}

/**
 * Scans the vault for notes bound through Confluence frontmatter.
 * Uses metadataCache only. This is O(n) over Markdown files without reading file contents.
 *
 * Implicitly ignores the Obsidian config directory, which may be customized by the user.
 * Users do not need to maintain this ignore pattern manually.
 */
export function scanPublishableNotes(app: App, opts: ScanOptions): TFile[] {
	const all = app.vault.getMarkdownFiles();
	const scanFolders = opts.scanFolders.map(normalizeFolder).filter((s) => s.length > 0);
	const ignoreRegexes = [`${app.vault.configDir}/**`, ...opts.ignorePatterns]
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
		.map(globToRegex);

	const out: TFile[] = [];
	for (const file of all) {
		if (scanFolders.length > 0 && !scanFolders.some((f) => file.path === f || file.path.startsWith(f + '/'))) continue;
		if (ignoreRegexes.some((r) => r.test(file.path))) continue;
		const rawFrontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!isFrontmatter(rawFrontmatter)) continue;

		const url = readFrontmatterString(rawFrontmatter, opts.frontmatterKey);
		const defaultUrl = readFrontmatterString(rawFrontmatter, FrontmatterFields.URL);
		const parentUrl = readFrontmatterString(rawFrontmatter, FrontmatterFields.PARENT_URL);
		const hasUrl = hasStringValue(url) || hasStringValue(defaultUrl);
		const hasParent = hasStringValue(parentUrl);
		// Publish only when a page URL or parent page URL is present. Parent URL is used for first-time child page creation.
		if (!hasUrl && !hasParent) continue;
		out.push(file);
	}
	return out;
}

function normalizeFolder(s: string): string {
	return s.trim().replace(/^\/+|\/+$/g, '');
}

/** Minimal glob -> RegExp conversion supporting * and ?. */
function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp('^' + escaped + '$');
}

function hasStringValue(value: string): boolean {
	return value.trim().length > 0;
}

function readFrontmatterString(frontmatter: Frontmatter, key: string): string {
	const value = frontmatter[key];
	return typeof value === 'string' ? value : '';
}

function isFrontmatter(value: unknown): value is Frontmatter {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
