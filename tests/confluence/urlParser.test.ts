import { describe, expect, it } from 'vitest';
import {
	parseConfluenceParentTargetFromUrl,
	parseFolderIdFromUrl,
	parsePageIdFromUrl,
} from '../../src/confluence/urlParser';

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

describe('parseFolderIdFromUrl', () => {
	it('parses Cloud folder URLs', () => {
		expect(parseFolderIdFromUrl('https://example.atlassian.net/wiki/spaces/DOC/folder/123456/My+Folder')).toBe('123456');
		expect(parseFolderIdFromUrl('https://example.atlassian.net/wiki/spaces/DOC/folders/987654/My+Folder')).toBe('987654');
	});

	it('returns null for non-folder URLs', () => {
		expect(parseFolderIdFromUrl('https://example.atlassian.net/wiki/spaces/DOC/pages/123456/Page')).toBeNull();
		expect(parseFolderIdFromUrl('')).toBeNull();
	});
});

describe('parseConfluenceParentTargetFromUrl', () => {
	it('resolves page parent targets', () => {
		expect(parseConfluenceParentTargetFromUrl('https://example.atlassian.net/wiki/spaces/DOC/pages/123456/Page')).toEqual({
			type: 'page',
			id: '123456',
			url: 'https://example.atlassian.net/wiki/spaces/DOC/pages/123456/Page',
		});
	});

	it('resolves folder parent targets with space keys', () => {
		expect(parseConfluenceParentTargetFromUrl('https://example.atlassian.net/wiki/spaces/DOC/folder/123456/My+Folder')).toEqual({
			type: 'folder',
			id: '123456',
			url: 'https://example.atlassian.net/wiki/spaces/DOC/folder/123456/My+Folder',
			spaceKey: 'DOC',
		});
	});
});
