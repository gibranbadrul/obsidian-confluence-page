export type ImageEmbedKind = 'wikilink' | 'markdown';

export interface ImageEmbedMatch {
	kind: ImageEmbedKind;
	/** Offsets are relative to the start of the line passed to findImageEmbedsOnLine. */
	matchFrom: number;
	matchTo: number;
	/** Raw link target (wikilink path, or the Markdown image's `(...)` destination, undecoded). */
	linkpath: string;
	/** Current raw alias/alt segment content (unparsed). */
	alias: string;
	aliasFrom: number;
	aliasTo: number;
	/** Wikilink only: true when the embed has no `|...` segment at all, so one must be inserted (`|` + new value). */
	needsPipeInsertion: boolean;
}

const WIKILINK_EMBED_RE = /!\[\[([^\]\n|\\]+)(?:\\?\|([^\]\n]*))?\]\]/g;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Finds Obsidian image embeds and standard Markdown images on a single line, sorted by position. */
export function findImageEmbedsOnLine(lineText: string): ImageEmbedMatch[] {
	const out: ImageEmbedMatch[] = [];

	for (const m of lineText.matchAll(WIKILINK_EMBED_RE)) {
		const matchFrom = m.index ?? 0;
		const matchTo = matchFrom + m[0].length;
		const linkpath = m[1]!.trim();
		const aliasPart = m[2];
		// The alias segment (if present) always ends right before the closing `]]`, regardless of whether the
		// separator before it was `|` or the escaped `\|` form, so working backward from matchTo is exact.
		const aliasTo = matchTo - 2;
		if (aliasPart !== undefined) {
			out.push({ kind: 'wikilink', matchFrom, matchTo, linkpath, alias: aliasPart, aliasFrom: aliasTo - aliasPart.length, aliasTo, needsPipeInsertion: false });
		} else {
			out.push({ kind: 'wikilink', matchFrom, matchTo, linkpath, alias: '', aliasFrom: aliasTo, aliasTo, needsPipeInsertion: true });
		}
	}

	for (const m of lineText.matchAll(MARKDOWN_IMAGE_RE)) {
		const matchFrom = m.index ?? 0;
		const alt = m[1] ?? '';
		const aliasFrom = matchFrom + 2; // right after `![`
		out.push({ kind: 'markdown', matchFrom, matchTo: matchFrom + m[0].length, linkpath: m[2]!, alias: alt, aliasFrom, aliasTo: aliasFrom + alt.length, needsPipeInsertion: false });
	}

	return out.sort((a, b) => a.matchFrom - b.matchFrom);
}

/** True when `embed` is the only thing on its line, aside from surrounding whitespace. */
export function isStandaloneImageEmbed(lineText: string, embed: ImageEmbedMatch): boolean {
	return lineText.slice(0, embed.matchFrom).trim() === '' && lineText.slice(embed.matchTo).trim() === '';
}
