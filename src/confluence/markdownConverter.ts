import type {App} from 'obsidian';
import MarkdownIt from 'markdown-it';
import {type AttachmentRef} from '../types';
import {sha1Hex} from '../utils/hash';
import {resolveAttachmentFile} from './attachmentUploader';

export interface DiagramBlock {
	/** Source sha1 hex. Used as the cache key and filename prefix. */
	hash: string;
	source: string;
	filename: string;
}

export interface ExtractedReferences {
	attachments: AttachmentRef[];
	mermaid: DiagramBlock[];
	plantUml: DiagramBlock[];
}


/** markdown-it env is typed as `any`; this converter only stores a callout state flag. */
interface CalloutEnv { __calloutOpen?: boolean }


export interface ConvertContext {
	/** filename -> successfully uploaded attachment records. Used by the image renderer. */
	attachedFilenames: Set<string>;
	/** hash -> successfully uploaded Mermaid PNG filename. */
	mermaidFilenameByHash: Map<string, string>;
	/** hash -> successfully uploaded PlantUML PNG filename. */
	plantUmlFilenameByHash: Map<string, string>;
	/** Feature flags. */
	renderMermaidToPng: boolean;
	renderPlantUmlToPng: boolean;
}

/**
 * Converts Obsidian Markdown to Confluence Storage XHTML.
 *
 * Expected flow:
 * 1. `extractReferences(markdown, sourcePath)` collects attachments and diagram blocks.
 * 2. The publish engine uploads attachments and renders diagrams.
 * 3. `convert(markdown, sourcePath, ctx)` renders the final Confluence Storage XHTML.
 *
 * The split is intentional. Markdown rendering does not perform network work directly; attachment upload
 * and diagram rendering are async/network-heavy work handled by the publish engine.
 */
export class MarkdownConverter {
	constructor(private app: App) {}

	async extractReferences(markdown: string, sourcePath: string): Promise<ExtractedReferences> {
		const body = prepareMarkdownForConfluence(stripFrontmatter(markdown));
		const preprocessed = preprocessObsidianSyntax(body);

		const attachments = this.collectAttachments(preprocessed, sourcePath);
		const mermaid = await this.collectDiagrams(preprocessed, 'mermaid');
		const plantUml = await this.collectDiagrams(preprocessed, 'plantuml');

		return { attachments, mermaid, plantUml };
	}

	async convert(markdown: string, _sourcePath: string, ctx: ConvertContext): Promise<string> {
		const body = prepareMarkdownForConfluence(stripFrontmatter(markdown));
		const preprocessed = preprocessObsidianSyntax(body);

		// Precompute each diagram fence hash. The markdown-it renderer can only look up prepared maps during rendering.
		const fenceHashMap = await this.buildFenceHashMap(preprocessed);

		const md = this.buildRenderer(ctx, fenceHashMap);
		const html = md.render(preprocessed);

		return postProcessHtml(html, ctx);
	}

	/** Computes a stable content hash for publish skipping. Ignored blocks are intentionally excluded. */
	async computeContentHash(markdown: string, pageTitle = ''): Promise<string> {
		const body = prepareMarkdownForConfluence(stripFrontmatter(markdown));
		const titleFingerprint = pageTitle.trim();
		return sha1Hex(`${body}\n\n<!-- confluence-page-title:${titleFingerprint} -->`);
	}

	private collectAttachments(markdown: string, sourcePath: string): AttachmentRef[] {
		// Mask fenced and inline code regions, so code examples containing image/link syntax are not treated as real attachments.
		const { masked } = maskCodeRegions(markdown);
		const refs: AttachmentRef[] = [];
		const seen = new Set<string>();

		// Obsidian embed: ![[file.png|alt]] / ![[folder/file.png]].
		// `\\?\|` supports escaped pipe in Markdown tables (`\|`).
		const embedRe = /!\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = embedRe.exec(masked)) !== null) {
			const linkpath = m[1]!.trim();
			// Note/heading/block embeds are not attachments.
			if (linkpath.includes('#')) continue;
			const alt = (m[2] ?? '').trim();
			const tfile = resolveAttachmentFile(this.app, linkpath, sourcePath);
			const filename = tfile?.name ?? linkpath.split('/').pop() ?? linkpath;
			const key = `embed:${filename}`;
			if (seen.has(key)) continue;
			seen.add(key);
			refs.push({ rawMatch: m[0], linkpath, alt, tfile, filename });
		}

		// Standard Markdown image:[alt](path "title").
		// Only relative paths or scheme-less URLs are treated as local attachments.
		const imgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
		while ((m = imgRe.exec(masked)) !== null) {
			const alt = m[1] ?? '';
			const path = m[2]!;
			if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(path) || path.startsWith('data:')) continue;
			if (path.includes('#')) continue;
			const decoded = tryDecode(path);
			const tfile = resolveAttachmentFile(this.app, decoded, sourcePath);
			const filename = tfile?.name ?? decoded.split('/').pop() ?? decoded;
			const key = `img:${filename}`;
			if (seen.has(key)) continue;
			seen.add(key);
			refs.push({ rawMatch: m[0], linkpath: decoded, alt, tfile, filename });
		}

		return refs;
	}

	private async collectDiagrams(markdown: string, lang: 'mermaid' | 'plantuml'): Promise<DiagramBlock[]> {
		const blocks = extractFenceBlocks(markdown).filter((b) => b.lang === lang);
		const seen = new Set<string>();
		const out: DiagramBlock[] = [];
		for (const b of blocks) {
			const hash = await sha1Hex(b.content);
			if (seen.has(hash)) continue;
			seen.add(hash);
			out.push({ hash, source: b.content, filename: `${lang}-${hash}.png` });
		}
		return out;
	}

	private async buildFenceHashMap(markdown: string): Promise<Map<string, string>> {
		// key: "lang|content" -> hash
		const map = new Map<string, string>();
		const blocks = extractFenceBlocks(markdown);
		for (const b of blocks) {
			if (b.lang !== 'mermaid' && b.lang !== 'plantuml') continue;
			const key = `${b.lang}|${b.content}`;
			if (map.has(key)) continue;
			map.set(key, await sha1Hex(b.content));
		}
		return map;
	}

	private buildRenderer(ctx: ConvertContext, fenceHashes: Map<string, string>): MarkdownIt {
		// xhtmlOut keeps void elements XHTML-compatible for Confluence Storage.
		const md = new MarkdownIt({ html: false, xhtmlOut: true, breaks: false, linkify: true });

		// fence: code blocks and diagrams.
		md.renderer.rules.fence = (tokens, idx) => {
			const token = tokens[idx]!;
			const lang = (token.info || '').trim().toLowerCase();
			// markdown-it keeps a trailing newline in fence content. Normalize before hash lookup.
			const content = token.content.replace(/\n+$/, '');

			if (lang === 'mermaid' && ctx.renderMermaidToPng) {
				const hash = fenceHashes.get(`mermaid|${content}`);
				const filename = hash ? ctx.mermaidFilenameByHash.get(hash) : undefined;
				if (filename) return renderAcImage(filename, '');
			}
			if (lang === 'plantuml' && ctx.renderPlantUmlToPng) {
				const hash = fenceHashes.get(`plantuml|${content}`);
				const filename = hash ? ctx.plantUmlFilenameByHash.get(hash) : undefined;
				if (filename) return renderAcImage(filename, '');
			}
			return renderAcCode(lang, content);
		};

		md.renderer.rules.code_block = (tokens, idx) => {
			return renderAcCode('', tokens[idx]!.content);
		};

		// image: replace uploaded local attachments with ac:image; keep external images as regular img tags.
		md.renderer.rules.image = (tokens, idx) => {
			const token = tokens[idx]!;
			const src = token.attrGet('src') ?? '';
			const alt = token.content || '';
			if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(src) || src.startsWith('data:')) {
				return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />`;
			}
			const decoded = tryDecode(src);
			const filename = decoded.split('/').pop() ?? decoded;
			if (ctx.attachedFilenames.has(filename)) {
				return renderAcImage(filename, alt);
			}
			return `<!-- Missing uploaded attachment: ${escapeAttr(filename)} -->`;
		};

		// callout: custom blockquote rendering.
		const originalBlockquoteOpen = md.renderer.rules.blockquote_open;
		const originalBlockquoteClose = md.renderer.rules.blockquote_close;
		md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
			const calloutType = detectCalloutType(tokens, idx);
			if (calloutType) {
				(env as CalloutEnv).__calloutOpen = true;
				return `<ac:structured-macro ac:name="${calloutType.macro}"><ac:rich-text-body>`;
			}
			return originalBlockquoteOpen
				? originalBlockquoteOpen(tokens, idx, options, env, self)
				: self.renderToken(tokens, idx, options);
		};
		md.renderer.rules.blockquote_close = (tokens, idx, options, env, self) => {
			const e = env as CalloutEnv;
			if (e.__calloutOpen) {
				e.__calloutOpen = false;
				return `</ac:rich-text-body></ac:structured-macro>`;
			}
			return originalBlockquoteClose
				? originalBlockquoteClose(tokens, idx, options, env, self)
				: self.renderToken(tokens, idx, options);
		};

		// Inline HTML is disabled by markdown-it. These rules are kept as a defensive fallback.
		md.renderer.rules.html_block = () => '';
		md.renderer.rules.html_inline = () => '';

		return md;
	}
}

// ============ Markdown preprocessing ============
function stripFrontmatter(md: string): string {
	if (!md.startsWith('---')) return md;
	const m = md.match(/^---\n[\s\S]*?\n---\n?/);
	if (!m) return md;
	return md.slice(m[0].length);
}

function prepareMarkdownForConfluence(markdown: string): string {
	const withoutIgnoredBlocks = removeIgnoredConfluenceBlocks(markdown);
	return removeIgnoredConfluenceLines(withoutIgnoredBlocks);
}

/** Removes content wrapped by Confluence ignore markers before reference extraction, hashing, and rendering. */
function removeIgnoredConfluenceBlocks(markdown: string): string {
	return markdown.replace(
		/^\s*<!--\s*confluence:ignore-start\s*-->[\s\S]*?^\s*<!--\s*confluence:ignore-end\s*-->\s*$/gim,
		'',
	);
}

/** Removes a single Markdown line marked as Confluence-only ignored content. */
function removeIgnoredConfluenceLines(markdown: string): string {
	return markdown
		.split('\n')
		.filter((line) => !/^\s*<!--\s*confluence:ignore-line\s*-->\s*/i.test(line))
		.join('\n');
}

/**
 * Performs minimal Obsidian-specific preprocessing so markdown-it can parse the note sensibly.
 * - `![[file]]` -> standard Markdown image syntax. The image renderer later turns this into `ac:image`.
 * - `[[link|alias]]` -> plain alias text.
 * - `> [!type] Title` -> private callout marker detected by the blockquote renderer.
 */
function preprocessObsidianSyntax(md: string): string {
	// Mask code regions to avoid rewriting examples that contain Obsidian syntax.
	const { masked, restore } = maskCodeRegions(md);
	let s = masked;

	// 1. ![[...]] embed -> ![alt](path)
	s = s.replace(/!\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g, (_full, link: string, alias: string) => {
		const text = (alias ?? '').trim();
		const linkpath = link.trim();
		if (linkpath.includes('#')) {
			return text || linkpath.split('/').pop() || linkpath;
		}
		return `![${text}](${linkpath})`;
	});

	// 2. [[link|alias]] / [[link]] -> plain text alias or link basename.
	s = s.replace(/\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g, (_full, link: string, alias: string) => {
		const cleanLink = link.trim();
		return (alias ?? '').trim() || cleanLink.split('/').pop() || cleanLink;
	});

	// 3. Callout header: `> [!info] Title` -> private marker.
	// PUA markers avoid markdown-it treats underscores as emphasis syntax.
	s = s.replace(/^(> )\[!([a-zA-Z]+)\](.*)$/gm, (_full, prefix: string, type: string, rest: string) => {
		return `${prefix}CALLOUT:${type.toUpperCase()}${rest}`;
	});

	return restore(s);
}

const CODE_MASK_OPEN = '';
const CODE_MASK_CLOSE = '';
const CODE_MASK_RE = /(\d+)/g;

/**
 * Masks fenced code and inline code regions with placeholders.
 * This prevents regex-based Obsidian preprocessing from modifying code examples.
 */
function maskCodeRegions(md: string): { masked: string; restore: (s: string) => string } {
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

interface FenceBlock { lang: string; content: string; }

/** Extracts fenced code blocks from raw Markdown. This intentionally stays small and predictable. */
function extractFenceBlocks(markdown: string): FenceBlock[] {
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

interface CalloutType { type: string; macro: string; }

/** Detects whether the first inline token inside a blockquote is an Obsidian callout marker. */
function detectCalloutType(tokens: ReadonlyArray<{ type: string; content?: string; children?: Array<{ content: string }> | null }>, openIdx: number): CalloutType | null {
	for (let i = openIdx + 1; i < tokens.length; i++) {
		const tk = tokens[i]!;
		if (tk.type === 'blockquote_close') return null;
		if (tk.type !== 'inline') continue;
		const text = (tk.children?.[0]?.content ?? tk.content ?? '');
		const m = text.match(/^CALLOUT:([A-Z]+)/);
		if (!m) return null;
		const stripRe = /^CALLOUT:[A-Z]+\s*/;
		if (tk.children?.[0]) {
			tk.children[0].content = tk.children[0].content.replace(stripRe, '');
		} else {
			tk.content = tk.content?.replace(stripRe, '') ?? '';
		}
		const type = m[1]!;
		return { type, macro: mapCalloutMacro(type) };
	}
	return null;
}

function mapCalloutMacro(type: string): string {
	switch (type) {
		case 'NOTE':
		case 'INFO':
		case 'TIP':
		case 'HINT': return 'info';
		case 'WARNING':
		case 'CAUTION':
		case 'ATTENTION': return 'warning';
		case 'DANGER':
		case 'ERROR':
		case 'FAILURE':
		case 'BUG': return 'note';
		case 'SUCCESS':
		case 'CHECK':
		case 'DONE': return 'tip';
		case 'QUOTE': return 'expand';
		default: return 'info';
	}
}

function renderAcCode(language: string, code: string): string {
	const langPart = language ? `<ac:parameter ac:name="language">${escapeXml(language)}</ac:parameter>` : '';
	return `<ac:structured-macro ac:name="code">${langPart}<ac:plain-text-body><![CDATA[${cdataSafe(code)}]]></ac:plain-text-body></ac:structured-macro>`;
}

function renderAcImage(filename: string, alt: string): string {
	const altPart = alt ? ` ac:alt="${escapeAttr(alt)}"` : '';
	return `<ac:image${altPart}><ri:attachment ri:filename="${escapeAttr(filename)}" /></ac:image>`;
}

function postProcessHtml(html: string, _ctx: ConvertContext): string {
	// markdown-it with xhtmlOut=true already handles common void elements, but this keeps Confluence Storage strict.
	const voidElements = ['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'embed', 'source', 'track', 'wbr'];
	let out = html;
	for (const tag of voidElements) {
		const re = new RegExp(`<${tag}\\b([^>]*?)(?<!/)>`, 'gi');
		out = out.replace(re, `<${tag}$1 />`);
	}
	return stripSupplementaryChars(out).trim();
}

/**
 * Some Confluence Server installations use MySQL utf8 instead of utf8mb4.
 * Characters above U+FFFF can fail storage parsing, so they are replaced with stable ASCII placeholders.
 */
function stripSupplementaryChars(s: string): string {
	let out = '';
	for (const ch of s) {
		const cp = ch.codePointAt(0)!;
		if (cp > 0xFFFF) {
			out += `[U+${cp.toString(16).toUpperCase()}]`;
		} else {
			out += ch;
		}
	}
	return out;
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
	return escapeXml(s).replace(/"/g, '&quot;');
}

function cdataSafe(s: string): string {
	return s.replace(/]]>/g, ']]]]><![CDATA[>');
}

function tryDecode(s: string): string {
	try { return decodeURIComponent(s); } catch { return s; }
}