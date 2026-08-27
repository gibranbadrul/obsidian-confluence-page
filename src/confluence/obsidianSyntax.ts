import type { App } from 'obsidian';
import { FrontmatterFields } from '../frontmatter/handler';
import { IGNORE_BLOCK_RE, IGNORE_LINE_RE } from './markers';

export interface ObsidianPreprocessContext {
	app: App;
	sourcePath: string;
}

export interface FenceBlock { lang: string; content: string; }

export function stripFrontmatter(md: string): string {
	if (!md.startsWith('---')) return md;
	const m = md.match(/^---\n[\s\S]*?\n---\n?/);
	if (!m) return md;
	return md.slice(m[0].length);
}

export function prepareMarkdownForConfluence(markdown: string): string {
	const withoutIgnoredBlocks = removeIgnoredConfluenceBlocks(markdown);
	return removeIgnoredConfluenceLines(withoutIgnoredBlocks);
}

/** Removes content wrapped by Confluence ignore markers before reference extraction, hashing, and rendering. */
function removeIgnoredConfluenceBlocks(markdown: string): string {
	return markdown.replace(IGNORE_BLOCK_RE, '');
}

/** Removes a single Markdown line marked as Confluence-only ignored content. */
function removeIgnoredConfluenceLines(markdown: string): string {
	return markdown
		.split('\n')
		.filter((line) => !IGNORE_LINE_RE.test(line))
		.join('\n');
}

/**
 * Performs minimal Obsidian-specific preprocessing so markdown-it can parse the note sensibly.
 * - `![[file]]` -> standard Markdown image syntax. The image renderer later turns this into `ac:image`.
 * - `![[note]]` -> plain display text. Embedded notes are not Confluence page links.
 * - `[[link|alias]]` -> Confluence page link when the target note has `confluence_url`; otherwise plain text.
 * - `> [!type] Title` -> private callout marker detected by the blockquote renderer.
 */
export function preprocessObsidianSyntax(md: string, ctx: ObsidianPreprocessContext): string {
	// Mask code regions to avoid rewriting examples that contain Obsidian syntax.
	const { masked, restore } = maskCodeRegions(md);
	let s = masked;

	// 1. ![[...]] embed -> image attachment for asset links, plain text for embedded notes.
	s = s.replace(/!\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g, (_full, link: string, alias: string) => {
		const text = (alias ?? '').trim();
		const linkpath = link.trim();
		if (!isLikelyAttachmentLinkpath(linkpath)) {
			return text || displayTextFromWikilink(linkpath);
		}
		return `![${escapeMarkdownLinkText(text)}](${markdownLinkDestination(linkpath)})`;
	});

	// 2. [[link|alias]] / [[link]] -> Confluence link when the target note has confluence_url.
	s = replaceObsidianPageLinks(s, ctx);

	// 3. Callout header: `> [!info] Title` / `> [!info]- Title` -> private marker. The optional `-`/`+`
	// fold marker (Obsidian's native foldable-callout syntax) is carried through so the renderer can turn
	// any foldable callout into a Confluence expand section, regardless of its icon type.
	// PUA markers avoid markdown-it treats underscores as emphasis syntax.
	s = s.replace(/^(> )\[!([a-zA-Z]+)\]([-+])?(.*)$/gm, (_full, prefix: string, type: string, fold: string | undefined, rest: string) => {
		return `${prefix}CALLOUT:${type.toUpperCase()}${fold ?? ''}${rest}`;
	});

	return restore(s);
}

function replaceObsidianPageLinks(markdown: string, ctx: ObsidianPreprocessContext): string {
	return markdown.replace(/(^|[^!])\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g, (_full, prefix: string, link: string, alias: string) => {
		const linkpath = link.trim();
		const displayText = (alias ?? '').trim() || displayTextFromWikilink(linkpath);
		const confluenceUrl = resolveConfluenceUrlForWikilink(ctx.app, linkpath, ctx.sourcePath);
		if (!confluenceUrl) return prefix + displayText;
		return `${prefix}[${escapeMarkdownLinkText(displayText)}](${markdownLinkDestination(confluenceUrl)})`;
	});
}

export function buildConfluencePageLinkFingerprint(app: App, markdown: string, sourcePath: string): string {
	const { masked } = maskCodeRegions(markdown);
	const refs: string[] = [];
	masked.replace(/(^|[^!])\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g, (_full, _prefix: string, link: string) => {
		const linkpath = link.trim();
		const confluenceUrl = resolveConfluenceUrlForWikilink(app, linkpath, sourcePath);
		refs.push(`${linkpath}=${confluenceUrl ?? ''}`);
		return '';
	});
	return refs.join('|');
}

function resolveConfluenceUrlForWikilink(app: App, linkpath: string, sourcePath: string): string | null {
	const targetPath = stripObsidianSubpath(linkpath).trim();
	if (!targetPath) return null;

	const target = app.metadataCache.getFirstLinkpathDest(targetPath, sourcePath);
	if (!target) return null;

	const frontmatter = app.metadataCache.getFileCache(target)?.frontmatter;
	const value: unknown = frontmatter?.[FrontmatterFields.URL];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function displayTextFromWikilink(linkpath: string): string {
	const cleanPath = stripObsidianSubpath(linkpath);
	const basename = cleanPath.split('/').pop() || cleanPath || linkpath;
	return basename.replace(/\.md$/i, '');
}

function stripObsidianSubpath(linkpath: string): string {
	return linkpath.split('#')[0]?.split('^')[0]?.trim() ?? '';
}

function isLikelyAttachmentLinkpath(linkpath: string): boolean {
	const cleanPath = stripObsidianSubpath(linkpath);
	const name = cleanPath.split('/').pop() ?? cleanPath;
	return /\.[a-z0-9]{1,12}$/i.test(name) && !/\.md$/i.test(name);
}

function escapeMarkdownLinkText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function markdownLinkDestination(value: string): string {
	return encodeURI(value).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// Private Use Area sentinels ensure the mask placeholder is only ever matched back by restore(),
// never confused with ordinary digit runs (e.g. numbers inside a URL) in the surrounding text.
const CODE_MASK_OPEN = '';
const CODE_MASK_CLOSE = '';
const CODE_MASK_RE = /(\d+)/g;

/**
 * Masks fenced code and inline code regions with placeholders.
 * This prevents regex-based Obsidian preprocessing from modifying code examples.
 */
export function maskCodeRegions(md: string): { masked: string; restore: (s: string) => string } {
	const buf: string[] = [];
	const stash = (text: string): string => {
		const idx = buf.length;
		buf.push(text);
		return `${CODE_MASK_OPEN}${idx}${CODE_MASK_CLOSE}`;
	};

	// 1. Fenced code blocks using ``` or ~~~.
	let masked = md.replace(
		/(^|\n)([ \t]*)(`{3,}|~{3,})([^\n]*\n[\s\S]*?\n)\2\3[ \t]*(?=\n|$)/g,
		(_full, lead: string, indent: string, fence: string, body: string) => {
			return `${lead}${stash(`${indent}${fence}${body}${indent}${fence}`)}`;
		},
	);

	// 2. Inline code using balanced backticks, without newlines.
	masked = masked.replace(/(`+)([^`\n]+?)\1(?!`)/g, (full) => stash(full));

	const restore = (s: string): string =>
		s.replace(CODE_MASK_RE, (_, idxStr: string) => buf[parseInt(idxStr, 10)] ?? '');

	return { masked, restore };
}

/** Extracts fenced code blocks from raw Markdown. This intentionally stays small and predictable. */
export function extractFenceBlocks(markdown: string): FenceBlock[] {
	const out: FenceBlock[] = [];
	const lines = markdown.split('\n');
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		const m = line.match(/^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/);
		if (!m) { i += 1; continue; }
		const indent = m[1]!.length;
		const fence = m[2]!;
		const lang = (m[3] ?? '').toLowerCase();
		const start = i + 1;
		i = start;
		while (i < lines.length) {
			const closing = lines[i]!.match(/^(\s*)(`{3,}|~{3,})\s*$/);
			if (closing && closing[2]!.startsWith(fence[0]!) && closing[2]!.length >= fence.length && closing[1]!.length === indent) {
				break;
			}
			i += 1;
		}
		const content = lines.slice(start, i).join('\n');
		out.push({ lang, content });
		i += 1;
	}
	return out;
}
