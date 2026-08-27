import { describe, expect, it } from 'vitest';
import { findImageEmbedsOnLine, isStandaloneImageEmbed } from '../../src/editor/imageEmbedLocator';

describe('findImageEmbedsOnLine', () => {
	it('locates a wikilink embed with an existing alias segment', () => {
		const line = 'Before ![[image.png|300x200]] after';
		const [embed] = findImageEmbedsOnLine(line);

		expect(embed?.kind).toBe('wikilink');
		expect(embed?.linkpath).toBe('image.png');
		expect(embed?.alias).toBe('300x200');
		expect(embed?.needsPipeInsertion).toBe(false);
		expect(line.slice(embed!.aliasFrom, embed!.aliasTo)).toBe('300x200');
		expect(line.slice(embed!.matchFrom, embed!.matchTo)).toBe('![[image.png|300x200]]');
	});

	it('locates a wikilink embed with no alias segment and flags it for pipe insertion', () => {
		const line = '![[image.png]]';
		const [embed] = findImageEmbedsOnLine(line);

		expect(embed?.alias).toBe('');
		expect(embed?.needsPipeInsertion).toBe(true);
		expect(embed?.aliasFrom).toBe(embed?.aliasTo);
		expect(line.slice(0, embed!.aliasFrom)).toBe('![[image.png');
	});

	it('locates a standard Markdown image and its alt segment', () => {
		const line = '![300x200](assets/image.png "title")';
		const [embed] = findImageEmbedsOnLine(line);

		expect(embed?.kind).toBe('markdown');
		expect(embed?.linkpath).toBe('assets/image.png');
		expect(embed?.alias).toBe('300x200');
		expect(line.slice(embed!.aliasFrom, embed!.aliasTo)).toBe('300x200');
	});

	it('returns multiple embeds on the same line sorted by position', () => {
		const line = '![[a.png|left]] and ![b](b.png)';
		const embeds = findImageEmbedsOnLine(line);

		expect(embeds).toHaveLength(2);
		expect(embeds[0]?.alias).toBe('left');
		expect(embeds[1]?.alias).toBe('b');
	});

	it('returns an empty array when the line has no image embed', () => {
		expect(findImageEmbedsOnLine('Just some text with [[a wikilink]] but no image')).toEqual([]);
	});
});

describe('isStandaloneImageEmbed', () => {
	it('is true when the embed is the only thing on the line', () => {
		const line = '![[image.png|300]]';
		const [embed] = findImageEmbedsOnLine(line);
		expect(isStandaloneImageEmbed(line, embed!)).toBe(true);
	});

	it('is true with surrounding whitespace', () => {
		const line = '   ![[image.png]]   ';
		const [embed] = findImageEmbedsOnLine(line);
		expect(isStandaloneImageEmbed(line, embed!)).toBe(true);
	});

	it('is false when there is other text on the line', () => {
		const line = 'See this: ![[image.png]]';
		const [embed] = findImageEmbedsOnLine(line);
		expect(isStandaloneImageEmbed(line, embed!)).toBe(false);
	});
});
