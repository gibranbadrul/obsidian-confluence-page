export interface CalloutType { type: string; macro: string; title: string; }

/** Detects whether the first inline token inside a blockquote is an Obsidian callout marker. */
export function detectCalloutType(tokens: ReadonlyArray<{ type: string; content?: string; children?: Array<{ type: string; content: string }> | null }>, openIdx: number): CalloutType | null {
	for (let i = openIdx + 1; i < tokens.length; i++) {
		const tk = tokens[i]!;
		if (tk.type === 'blockquote_close') return null;
		if (tk.type !== 'inline') continue;
		const text = (tk.children?.[0]?.content ?? tk.content ?? '');
		const m = text.match(/^CALLOUT:([A-Z]+)([-+])?/);
		if (!m) return null;
		const stripRe = /^CALLOUT:[A-Z]+[-+]?\s*/;
		const type = m[1]!;
		const foldable = Boolean(m[2]);
		const macro = mapCalloutMacro(type, foldable);

		let title = '';
		if (tk.children?.[0]) {
			tk.children[0].content = tk.children[0].content.replace(stripRe, '');
			if (macro === 'expand') {
				// The expand macro shows its title on the collapsed toggle via ac:parameter (see
				// renderAcExpandOpen), so the title line is pulled out of the body entirely here —
				// otherwise it would render a second time as the body's first line once expanded.
				const children = tk.children;
				const breakIdx = children.findIndex((c) => c.type === 'softbreak' || c.type === 'hardbreak');
				const titleChildren = breakIdx === -1 ? children : children.slice(0, breakIdx);
				title = titleChildren.map((c) => c.content).join('').trim();
				children.splice(0, breakIdx === -1 ? children.length : breakIdx + 1);
			} else {
				title = tk.children[0].content;
			}
		} else {
			tk.content = tk.content?.replace(stripRe, '') ?? '';
			title = tk.content;
		}
		return { type, macro, title };
	}
	return null;
}

/** A foldable callout (`[!type]-`/`[!type]+`, Obsidian's native fold syntax) becomes a Confluence
 * expand section regardless of its icon type — Confluence's colored panels have no collapse option,
 * only the expand macro does, so foldability takes priority over whatever type was picked for the icon. */
function mapCalloutMacro(type: string, foldable: boolean): string {
	if (foldable) return 'expand';
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
		default: return 'info';
	}
}

export function renderAcCode(language: string, code: string): string {
	const langPart = language ? `<ac:parameter ac:name="language">${escapeXml(language)}</ac:parameter>` : '';
	return `<ac:structured-macro ac:name="code">${langPart}<ac:plain-text-body><![CDATA[${cdataSafe(code)}]]></ac:plain-text-body></ac:structured-macro>`;
}

/** Opening half of a `<details><summary>title</summary>...</details>` block's expand macro — paired with
 * renderAcExpandClose() around the body, which is rendered as normal nested Markdown by the caller (see
 * the confluence_expand block rule in markdownConverter.ts), not passed in as a string here. */
export function renderAcExpandOpen(title: string): string {
	const titlePart = title ? `<ac:parameter ac:name="title">${escapeXml(title)}</ac:parameter>` : '';
	return `<ac:structured-macro ac:name="expand">${titlePart}<ac:rich-text-body>`;
}

export function renderAcExpandClose(): string {
	return `</ac:rich-text-body></ac:structured-macro>`;
}

export type ImageAlign = 'left' | 'center' | 'right';
export type ImageBorderSize = 'subtle' | 'medium' | 'bold';
export type ImageBorderColor = 'light' | 'medium' | 'dark';

export interface ImageAttributes {
	/** Accessibility text only — renders as `ac:alt`, which Confluence never displays visibly. */
	alt: string;
	/** Visible text shown under the image — renders as a Confluence Cloud `ac:caption` child element
	 * (best-effort, same caveat as borderSize/borderColor below: not documented as writable through the
	 * content REST API, so it may silently have no visible effect on some instances). Distinct from
	 * `alt`: alt text is invisible accessibility metadata, caption is what a reader actually sees. */
	caption?: string;
	width?: string;
	height?: string;
	align?: ImageAlign;
	/** Wraps surrounding text around the image instead of the image sitting on its own line — Confluence
	 * models this as a distinct `ac:layout="wrap-left"`/`"wrap-right"` pair, only meaningful alongside
	 * `align: 'left' | 'right'` (there's no "wrap-center"). */
	wrap?: boolean;
	border?: boolean;
	/** Confluence Cloud only (ADF `border` mark, best-effort). Server/Data Center falls back to a plain border. */
	borderSize?: ImageBorderSize;
	/** Confluence Cloud only (ADF `border` mark, best-effort), same caveat as borderSize. */
	borderColor?: ImageBorderColor;
}

/**
 * All modifier tokens are namespaced under this prefix (`cpp-300`, `cpp-border`, `cpp-border-subtle`, ...)
 * instead of bare words (`300`, `border`, ...). Two reasons: other Obsidian plugins also read the same `|`
 * alias segment for their own image-resize syntax (often bare numbers), so an unprefixed token here could be
 * misinterpreted by — or steal the meaning intended for — one of those; and it sharply cuts how often literal
 * alt text collides with a modifier keyword (alt text starting with "cpp-" is effectively never intentional).
 */
const PREFIX = 'cpp-';
const IMAGE_ALIGN_RE = new RegExp(`^${PREFIX}(left|center|right)$`);
const IMAGE_WRAP_TOKEN = `${PREFIX}wrap`;
const IMAGE_BORDER_TOKEN = `${PREFIX}border`;
const IMAGE_BORDER_SIZE_TOKENS: Record<string, ImageBorderSize> = {
	[`${PREFIX}border-subtle`]: 'subtle',
	[`${PREFIX}border-medium`]: 'medium',
	[`${PREFIX}border-bold`]: 'bold',
};
const IMAGE_BORDER_SIZE_VALUES: Record<ImageBorderSize, string> = { subtle: '1', medium: '2', bold: '3' };
const IMAGE_BORDER_DEFAULT_SIZE: ImageBorderSize = 'subtle';
const IMAGE_BORDER_DEFAULT_COLOR = '#091e4224';
const IMAGE_BORDER_COLOR_TOKENS: Record<string, ImageBorderColor> = {
	[`${PREFIX}border-color-light`]: 'light',
	[`${PREFIX}border-color-medium`]: 'medium',
	[`${PREFIX}border-color-dark`]: 'dark',
};
const IMAGE_BORDER_COLOR_VALUES: Record<ImageBorderColor, string> = { light: '#DFE1E6', medium: '#8993A4', dark: '#172B4D' };
const IMAGE_WIDTH_RE = new RegExp(`^${PREFIX}w-(\\d+)$`);
const IMAGE_HEIGHT_RE = new RegExp(`^${PREFIX}h-(\\d+)$`);
// `:` rather than `-` as the key/value separator (unlike every other token above) because the value is
// arbitrary free text, not a fixed keyword — a dash would be indistinguishable from one that's just
// part of the caption itself.
const IMAGE_CAPTION_RE = new RegExp(`^${PREFIX}caption:(.*)$`);

/**
 * Splits the Obsidian image alias/alt segment (pipe-separated) into display alt text plus optional
 * size/align/wrap/border/caption modifiers, in any order and position: `cpp-w-300` / `cpp-h-200` (size —
 * independent, either or both), `cpp-left` / `cpp-center` / `cpp-right` (align), `cpp-wrap` (wraps text
 * around a left/right-aligned image — no-op with `cpp-center`), `cpp-border` and
 * `cpp-border-subtle` / `cpp-border-medium` / `cpp-border-bold` (border thickness),
 * `cpp-border-color-light` / `cpp-border-color-medium` / `cpp-border-color-dark` (border color), and
 * `cpp-caption:<text>` (the visible caption — see ImageAttributes). Each `|`-separated token is
 * classified independently: a recognized modifier keyword is applied as that modifier, and every other
 * token is treated as (part of) the alt text. A token that exactly matches a modifier keyword is read as
 * that modifier, not literal alt text — the `cpp-` prefix (see PREFIX above) is what makes that an
 * intentional collision rather than an accidental one, since real alt text essentially never starts
 * with it.
 */
export function parseImageAttributes(raw: string): ImageAttributes {
	const trimmed = raw.trim();
	if (!trimmed) return { alt: '' };

	const tokens = trimmed.split('|').map((token) => token.trim()).filter(Boolean);
	const attrs: ImageAttributes = { alt: '' };
	const altParts: string[] = [];

	for (const token of tokens) {
		const width = token.match(IMAGE_WIDTH_RE);
		if (width) { attrs.width = width[1]; continue; }

		const height = token.match(IMAGE_HEIGHT_RE);
		if (height) { attrs.height = height[1]; continue; }

		const caption = token.match(IMAGE_CAPTION_RE);
		if (caption) { attrs.caption = caption[1]; continue; }

		const lower = token.toLowerCase();
		const alignMatch = lower.match(IMAGE_ALIGN_RE);
		if (alignMatch) { attrs.align = alignMatch[1] as ImageAlign; continue; }
		if (lower === IMAGE_WRAP_TOKEN) { attrs.wrap = true; continue; }
		if (lower === IMAGE_BORDER_TOKEN) { attrs.border = true; continue; }
		const borderSize = IMAGE_BORDER_SIZE_TOKENS[lower];
		if (borderSize) { attrs.border = true; attrs.borderSize = borderSize; continue; }
		const borderColor = IMAGE_BORDER_COLOR_TOKENS[lower];
		if (borderColor) { attrs.border = true; attrs.borderColor = borderColor; continue; }

		altParts.push(token);
	}

	attrs.alt = altParts.join('|');
	return attrs;
}

/** Inverse of parseImageAttributes: serializes attrs back into the `|`-separated alias segment source text. */
export function stringifyImageAttributes(attrs: ImageAttributes): string {
	const parts: string[] = [];
	if (attrs.alt) parts.push(attrs.alt);
	if (attrs.caption) parts.push(`${PREFIX}caption:${attrs.caption}`);
	if (attrs.width) parts.push(`${PREFIX}w-${attrs.width}`);
	if (attrs.height) parts.push(`${PREFIX}h-${attrs.height}`);
	if (attrs.align) parts.push(`${PREFIX}${attrs.align}`);
	// Only meaningful alongside a left/right align — see the `wrap` field doc on ImageAttributes.
	if (attrs.wrap && attrs.align !== 'center') parts.push(IMAGE_WRAP_TOKEN);
	if (attrs.borderColor) parts.push(`${PREFIX}border-color-${attrs.borderColor}`);
	if (attrs.borderSize) parts.push(`${PREFIX}border-${attrs.borderSize}`);
	// A borderColor token alone already implies border:true, so the plain marker is only needed when
	// neither a size nor a color was picked — otherwise it'd be a redundant extra token.
	else if (attrs.border && !attrs.borderColor) parts.push(IMAGE_BORDER_TOKEN);
	return parts.join('|');
}

export function renderAcImage(filename: string, attrs: ImageAttributes): string {
	const altPart = attrs.alt ? ` ac:alt="${escapeAttr(attrs.alt)}"` : '';
	const widthPart = attrs.width ? ` ac:width="${escapeAttr(attrs.width)}"` : '';
	const heightPart = attrs.height ? ` ac:height="${escapeAttr(attrs.height)}"` : '';
	const alignPart = attrs.align ? ` ac:align="${attrs.align}"` : '';
	// Confluence models "wrap text around the image" as a distinct ac:layout value paired with ac:align,
	// not a standalone flag — center has no wrap equivalent, so it's a no-op there.
	const layoutPart = attrs.wrap && (attrs.align === 'left' || attrs.align === 'right')
		? ` ac:layout="wrap-${attrs.align}"`
		: '';
	const borderPart = attrs.border ? ` ac:border="true"` : '';
	// The ac:border attribute alone renders a plain border everywhere. The ac:adf-mark child additionally
	// requests the sized/colored Confluence Cloud border style; unsupported targets (Server/Data Center, or a
	// Cloud instance that doesn't honor it on write) are expected to just ignore the unknown element. Picking
	// only one of size/color still emits the mark — the other half falls back to its default rather than
	// silently dropping the one the user did pick.
	const borderMark = (attrs.borderSize || attrs.borderColor)
		? `<ac:adf-mark key="border" size="${IMAGE_BORDER_SIZE_VALUES[attrs.borderSize ?? IMAGE_BORDER_DEFAULT_SIZE]}" color="${attrs.borderColor ? IMAGE_BORDER_COLOR_VALUES[attrs.borderColor] : IMAGE_BORDER_DEFAULT_COLOR}" />`
		: '';
	// A visible caption (Confluence Cloud only, best-effort — same caveat as the border mark above) is an
	// `<ac:caption>` child, not the `ac:alt` attribute. No inner <p>: markdown-it wraps a standalone image
	// line's output in its own block <p>, so a <p> here would nest invalid <p>-inside-<p> XHTML.
	const captionMark = attrs.caption ? `<ac:caption>${escapeXml(attrs.caption)}</ac:caption>` : '';
	return `<ac:image${altPart}${widthPart}${heightPart}${alignPart}${layoutPart}${borderPart}><ri:attachment ri:filename="${escapeAttr(filename)}" />${borderMark}${captionMark}</ac:image>`;
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
