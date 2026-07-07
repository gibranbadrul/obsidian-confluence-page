import { describe, expect, it } from 'vitest';
import { TFile } from '../helpers/obsidian';
import {
	FrontmatterFields,
	hasPublishingBinding,
	insertTemplateFrontmatter,
	readBindingFromCache,
	writeBinding,
} from '../../src/frontmatter/handler';

function createApp(frontmatter: Record<string, unknown>) {
	return {
		metadataCache: {
			getFileCache: () => ({ frontmatter }),
		},
		fileManager: {
			processFrontMatter: async (_file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
				callback(frontmatter);
			},
		},
	} as never;
}

describe('frontmatter handler', () => {
	it('reads existing page bindings from frontmatter', () => {
		const fm = {
			confluence_url: 'https://example.atlassian.net/wiki/spaces/DOC/pages/123/Page',
			confluence_page_id: '123',
			confluence_last_published_at: '2026-07-07T10:00:00.000Z',
			confluence_content_hash: 'hash-a',
			confluence_attachments: {
				'123': {
					'image.png': { hash: 'image-hash', id: 'att123' },
				},
			},
		};

		const binding = readBindingFromCache(createApp(fm), new TFile('note.md'));

		expect(binding).toMatchObject({
			url: fm.confluence_url,
			pageId: '123',
			lastPublished: fm.confluence_last_published_at,
			lastHash: 'hash-a',
		});
		expect(binding?.attachments?.['123']?.['image.png']).toEqual({ hash: 'image-hash', id: 'att123' });
	});

	it('normalizes legacy flat attachment cache using the current page ID', () => {
		const fm = {
			confluence_url: 'https://example.atlassian.net/wiki/spaces/DOC/pages/123/Page',
			confluence_page_id: '123',
			confluence_attachments: {
				'image.png': { hash: 'image-hash', id: 'att123' },
			},
		};

		const binding = readBindingFromCache(createApp(fm), new TFile('note.md'));

		expect(binding?.attachments?.['123']?.['image.png']).toEqual({ hash: 'image-hash', id: 'att123' });
	});

	it('reads parent URL bindings for first-time child page creation', () => {
		const fm = {
			confluence_url: '',
			confluence_parent_url: 'https://example.atlassian.net/wiki/spaces/DOC/pages/100/Parent',
		};

		const binding = readBindingFromCache(createApp(fm), new TFile('note.md'));

		expect(binding?.url).toBe('');
		expect(binding?.parentUrl).toBe(fm.confluence_parent_url);
	});

	it('returns null when no publishing binding exists', () => {
		const binding = readBindingFromCache(createApp({ title: 'Regular note' }), new TFile('note.md'));

		expect(binding).toBeNull();
	});

	it('detects custom URL field bindings', () => {
		const fm = { confluence_page_url: 'https://example.atlassian.net/wiki/spaces/DOC/pages/123/Page' };

		expect(readBindingFromCache(createApp(fm), new TFile('note.md'), 'confluence_page_url')?.url).toBe(fm.confluence_page_url);
	});

	it('inserts template fields when the note is not already bound', async () => {
		const fm: Record<string, unknown> = {};
		const inserted = await insertTemplateFrontmatter(createApp(fm), new TFile('note.md'), 'https://example/page');

		expect(inserted).toBe(true);
		expect(fm[FrontmatterFields.URL]).toBe('https://example/page');
		expect(fm[FrontmatterFields.PARENT_URL]).toBe('');
		expect(fm[FrontmatterFields.PAGE_ID]).toBe('');
		expect(fm[FrontmatterFields.CUSTOM_TITLE]).toBe('');
		expect(fm[FrontmatterFields.LAST_PUBLISHED]).toBe('');
		expect(fm[FrontmatterFields.LAST_HASH]).toBe('');
	});

	it('does not insert template fields when the note is already bound', async () => {
		const fm: Record<string, unknown> = { confluence_url: 'https://example/page' };
		const inserted = await insertTemplateFrontmatter(createApp(fm), new TFile('note.md'), 'https://other/page');

		expect(inserted).toBe(false);
		expect(fm.confluence_url).toBe('https://example/page');
	});

	it('writes publish metadata and attachment cache back to frontmatter', async () => {
		const fm: Record<string, unknown> = {
			confluence_url: 'https://example/page',
		};

		await writeBinding(createApp(fm), new TFile('note.md'), {
			pageId: '123',
			lastPublished: '2026-07-07T10:00:00.000Z',
			lastHash: 'hash-a',
			attachments: {
				'123': {
					'image.png': { hash: 'image-hash', id: 'att123' },
				},
			},
		});

		expect(fm.confluence_page_id).toBe('123');
		expect(fm.confluence_last_published_at).toBe('2026-07-07T10:00:00.000Z');
		expect(fm.confluence_content_hash).toBe('hash-a');
		expect(fm.confluence_attachments).toEqual({
			'123': {
				'image.png': { hash: 'image-hash', id: 'att123' },
			},
		});
	});

	it('detects publishing bindings from URL or parent URL fields', () => {
		expect(hasPublishingBinding({ confluence_url: 'https://example/page' })).toBe(true);
		expect(hasPublishingBinding({ confluence_parent_url: 'https://example/parent' })).toBe(true);
		expect(hasPublishingBinding({ title: 'Regular note' })).toBe(false);
	});
});
