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

export function renderAcImage(filename: string, alt: string): string {
	const altPart = alt ? ` ac:alt="${escapeAttr(alt)}"` : '';
	return `<ac:image${altPart}><ri:attachment ri:filename="${escapeAttr(filename)}" /></ac:image>`;
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
