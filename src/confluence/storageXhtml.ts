export interface CalloutType { type: string; macro: string; }

/** Detects whether the first inline token inside a blockquote is an Obsidian callout marker. */
export function detectCalloutType(tokens: ReadonlyArray<{ type: string; content?: string; children?: Array<{ content: string }> | null }>, openIdx: number): CalloutType | null {
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

export function renderAcCode(language: string, code: string): string {
	const langPart = language ? `<ac:parameter ac:name="language">${escapeXml(language)}</ac:parameter>` : '';
	return `<ac:structured-macro ac:name="code">${langPart}<ac:plain-text-body><![CDATA[${cdataSafe(code)}]]></ac:plain-text-body></ac:structured-macro>`;
}

export type ImageAlign = 'left' | 'center' | 'right';
export type ImageBorderSize = 'subtle' | 'medium' | 'bold';

export interface ImageAttributes {
	alt: string;
	width?: string;
	height?: string;
	align?: ImageAlign;
	border?: boolean;
	/** Confluence Cloud only (ADF `border` mark, best-effort). Server/Data Center falls back to a plain border. */
	borderSize?: ImageBorderSize;
}

const IMAGE_ALIGN_VALUES: ReadonlySet<string> = new Set(['left', 'center', 'right']);
const IMAGE_BORDER_TOKEN = 'border';
const IMAGE_BORDER_SIZE_TOKENS: Record<string, ImageBorderSize> = {
	'border-subtle': 'subtle',
	'border-medium': 'medium',
	'border-bold': 'bold',
};
const IMAGE_BORDER_SIZE_VALUES: Record<ImageBorderSize, string> = { subtle: '1', medium: '2', bold: '3' };
const IMAGE_BORDER_DEFAULT_COLOR = '#091e4224';
const IMAGE_WIDTH_RE = /^(\d+)$/;
const IMAGE_WIDTH_HEIGHT_RE = /^(\d+)\s*[xX]\s*(\d+)$/;

/**
 * Splits the Obsidian image alias/alt segment (pipe-separated) into display alt text plus optional
 * size/align/border modifiers, in any order and position. `300` / `300x200` mirror Obsidian's own embed resize
 * syntax; `left` / `center` / `right`, `border`, and `border-subtle` / `border-medium` / `border-bold` are
 * Confluence-specific extensions. Each `|`-separated token is classified independently: a recognized modifier
 * keyword is applied as that modifier, and every other token is treated as (part of) the alt text, e.g.
 * `![[image.png|A caption|300x200|border-bold|center]]` keeps "A caption" as alt text alongside the modifiers.
 * A token that happens to exactly match a modifier keyword (e.g. alt text "center") is read as that modifier,
 * not literal alt text — this is an inherent trade-off of a keyword-based syntax sharing the same segment.
 */
export function parseImageAttributes(raw: string): ImageAttributes {
	const trimmed = raw.trim();
	if (!trimmed) return { alt: '' };

	const tokens = trimmed.split('|').map((token) => token.trim()).filter(Boolean);
	const attrs: ImageAttributes = { alt: '' };
	const altParts: string[] = [];

	for (const token of tokens) {
		const widthOnly = token.match(IMAGE_WIDTH_RE);
		if (widthOnly) { attrs.width = widthOnly[1]; continue; }

		const widthAndHeight = token.match(IMAGE_WIDTH_HEIGHT_RE);
		if (widthAndHeight) { attrs.width = widthAndHeight[1]; attrs.height = widthAndHeight[2]; continue; }

		const lower = token.toLowerCase();
		if (IMAGE_ALIGN_VALUES.has(lower)) { attrs.align = lower as ImageAlign; continue; }
		if (lower === IMAGE_BORDER_TOKEN) { attrs.border = true; continue; }
		const borderSize = IMAGE_BORDER_SIZE_TOKENS[lower];
		if (borderSize) { attrs.border = true; attrs.borderSize = borderSize; continue; }

		altParts.push(token);
	}

	attrs.alt = altParts.join('|');
	return attrs;
}

export function renderAcImage(filename: string, attrs: ImageAttributes): string {
	const altPart = attrs.alt ? ` ac:alt="${escapeAttr(attrs.alt)}"` : '';
	const widthPart = attrs.width ? ` ac:width="${escapeAttr(attrs.width)}"` : '';
	const heightPart = attrs.height ? ` ac:height="${escapeAttr(attrs.height)}"` : '';
	const alignPart = attrs.align ? ` ac:align="${attrs.align}"` : '';
	const borderPart = attrs.border ? ` ac:border="true"` : '';
	// The ac:border attribute alone renders a plain border everywhere. The ac:adf-mark child additionally
	// requests the sized/colored Confluence Cloud border style; unsupported targets (Server/Data Center, or a
	// Cloud instance that doesn't honor it on write) are expected to just ignore the unknown element.
	const borderMark = attrs.borderSize
		? `<ac:adf-mark key="border" size="${IMAGE_BORDER_SIZE_VALUES[attrs.borderSize]}" color="${IMAGE_BORDER_DEFAULT_COLOR}" />`
		: '';
	return `<ac:image${altPart}${widthPart}${heightPart}${alignPart}${borderPart}><ri:attachment ri:filename="${escapeAttr(filename)}" />${borderMark}</ac:image>`;
}

export function renderAcToc(): string {
	return `<ac:structured-macro ac:name="toc" />`;
}

export function postProcessHtml(html: string): string {
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

export function escapeAttr(s: string): string {
	return escapeXml(s).replace(/"/g, '&quot;');
}

function cdataSafe(s: string): string {
	return s.replace(/]]>/g, ']]]]><![CDATA[>');
}

export function tryDecode(s: string): string {
	try { return decodeURIComponent(s); } catch { return s; }
}
