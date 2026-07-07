import { describe, expect, it } from 'vitest';
import { parsePageIdFromUrl } from '../../src/confluence/urlParser';

describe('parsePageIdFromUrl', () => {
	it('parses modern Confluence page URLs', () => {
		expect(parsePageIdFromUrl('https://example.atlassian.net/wiki/spaces/DOC/pages/123456/My+Page')).toBe('123456');
	});

	it('parses viewpage URLs with pageId query param', () => {
		expect(parsePageIdFromUrl('https://example.atlassian.net/wiki/pages/viewpage.action?pageId=987654')).toBe('987654');
	});

	it('returns null for space URLs and empty input', () => {
		expect(parsePageIdFromUrl('https://example.atlassian.net/wiki/spaces/DOC')).toBeNull();
		expect(parsePageIdFromUrl('')).toBeNull();
	});
});
