/**
 * Confluence-only Markdown markers (ignore-line, ignore-block, table of contents).
 *
 * Single source of truth: the marker text is defined once here and shared by the editor
 * commands that insert it (src/editor/confluenceMacros.ts) and the converter that
 * detects/strips it (src/confluence/obsidianSyntax.ts, markdownConverter.ts), so the two
 * sides cannot drift apart.
 */

const IGNORE_LINE = 'confluence:ignore-line';
const IGNORE_START = 'confluence:ignore-start';
const IGNORE_END = 'confluence:ignore-end';
const TOC = 'confluence:toc';

function comment(name: string): string {
	return `<!-- ${name} -->`;
}

function commentPattern(name: string): string {
	return `<!--\\s*${name}\\s*-->`;
}

export const IGNORE_LINE_MARKER = comment(IGNORE_LINE);
export const TOC_MARKER = comment(TOC);

export const IGNORE_LINE_RE = new RegExp(`^\\s*${commentPattern(IGNORE_LINE)}`, 'i');
export const IGNORE_BLOCK_RE = new RegExp(`^\\s*${commentPattern(IGNORE_START)}[\\s\\S]*?^\\s*${commentPattern(IGNORE_END)}\\s*$`, 'gim');
/** Anchored without a leading `\s*`: callers already slice the line past its indentation. */
export const TOC_LINE_RE = new RegExp(`^${commentPattern(TOC)}\\s*$`, 'i');

export function buildIgnoreBlock(content: string): string {
	const trimmed = content.trim();
	return trimmed
		? `${comment(IGNORE_START)}\n\n${trimmed}\n\n${comment(IGNORE_END)}`
		: `${comment(IGNORE_START)}\n\n\n${comment(IGNORE_END)}`;
}
