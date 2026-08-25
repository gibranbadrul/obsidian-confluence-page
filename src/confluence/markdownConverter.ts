import type { App } from 'obsidian';
import MarkdownIt from 'markdown-it';
import { type AttachmentRef } from '../types';
import { sha1Hex } from '../utils/hash';
import { resolveAttachmentFile } from './attachmentUploader';
import {
	buildConfluencePageLinkFingerprint,
	extractFenceBlocks,
	maskCodeRegions,
	prepareMarkdownForConfluence,
	preprocessObsidianSyntax,
	stripFrontmatter,
} from './obsidianSyntax';
import { TOC_LINE_RE } from './markers';
import {
	detectCalloutType,
	escapeAttr,
	parseImageAttributes,
	postProcessHtml,
	renderAcCode,
	renderAcImage,
	renderAcToc,
	tryDecode,
} from './storageXhtml';

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
		const preprocessed = preprocessObsidianSyntax(body, { app: this.app, sourcePath });

		const attachments = this.collectAttachments(preprocessed, sourcePath);
		const mermaid = await this.collectDiagrams(preprocessed, 'mermaid');
		const plantUml = await this.collectDiagrams(preprocessed, 'plantuml');

		return { attachments, mermaid, plantUml };
	}

	async convert(markdown: string, sourcePath: string, ctx: ConvertContext): Promise<string> {
		const body = prepareMarkdownForConfluence(stripFrontmatter(markdown));
		const preprocessed = preprocessObsidianSyntax(body, { app: this.app, sourcePath });

		// Precompute each diagram fence hash. The markdown-it renderer can only look up prepared maps during rendering.
		const fenceHashMap = await this.buildFenceHashMap(preprocessed);

		const md = this.buildRenderer(ctx, fenceHashMap);
		const html = md.render(preprocessed);

		return postProcessHtml(html);
	}

	/** Computes a stable content hash for publish skipping. Ignored blocks are intentionally excluded. */
	async computeContentHash(markdown: string, pageTitle = '', sourcePath = ''): Promise<string> {
		const body = prepareMarkdownForConfluence(stripFrontmatter(markdown));
		const titleFingerprint = pageTitle.trim();
		const pageLinkFingerprint = sourcePath ? buildConfluencePageLinkFingerprint(this.app, body, sourcePath) : '';
		return sha1Hex([
			body,
			`<!-- confluence-page-title:${titleFingerprint} -->`,
			`<!-- confluence-page-links:${pageLinkFingerprint} -->`,
		].join('\n\n'));
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
				if (filename) return renderAcImage(filename, { alt: '' });
			}
			if (lang === 'plantuml' && ctx.renderPlantUmlToPng) {
				const hash = fenceHashes.get(`plantuml|${content}`);
				const filename = hash ? ctx.plantUmlFilenameByHash.get(hash) : undefined;
				if (filename) return renderAcImage(filename, { alt: '' });
			}
			return renderAcCode(lang, content);
		};

		md.renderer.rules.code_block = (tokens, idx) => {
			return renderAcCode('', tokens[idx]!.content);
		};

		// image: replace uploaded local attachments with ac:image; keep external images as regular img tags.
		// The alt segment doubles as size/align/border hints; see parseImageAttributes for the syntax.
		md.renderer.rules.image = (tokens, idx) => {
			const token = tokens[idx]!;
			const src = token.attrGet('src') ?? '';
			const attrs = parseImageAttributes(token.content || '');
			if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(src) || src.startsWith('data:')) {
				// align/border are Confluence ac:image-only attributes; remote <img> tags only get resized.
				const widthPart = attrs.width ? ` width="${escapeAttr(attrs.width)}"` : '';
				const heightPart = attrs.height ? ` height="${escapeAttr(attrs.height)}"` : '';
				return `<img src="${escapeAttr(src)}" alt="${escapeAttr(attrs.alt)}"${widthPart}${heightPart} />`;
			}
			const decoded = tryDecode(src);
			const filename = decoded.split('/').pop() ?? decoded;
			if (ctx.attachedFilenames.has(filename)) {
				return renderAcImage(filename, attrs);
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

		// toc: a standalone `<!-- confluence:toc -->` line becomes a Confluence table of contents macro.
		// Registered as a block rule (rather than string replacement) so it never fires inside fenced/indented code.
		md.block.ruler.before('paragraph', 'confluence_toc', (state, startLine, _endLine, silent) => {
			const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
			const max = state.eMarks[startLine]!;
			const line = state.src.slice(pos, max);
			if (!TOC_LINE_RE.test(line)) return false;
			if (silent) return true;
			state.line = startLine + 1;
			state.push('confluence_toc', '', 0);
			return true;
		});
		md.renderer.rules.confluence_toc = () => renderAcToc();

		return md;
	}
}
