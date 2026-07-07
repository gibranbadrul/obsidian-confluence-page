import { describe, expect, it } from 'vitest';
import { TFile } from '../helpers/obsidian';
import { scanPublishableNotes } from '../../src/publish/noteScanner';

function createApp(files: TFile[], frontmatterByPath: Record<string, Record<string, unknown> | undefined>) {
	return {
		vault: {
			configDir: '.obsidian',
			getMarkdownFiles: () => files,
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({ frontmatter: frontmatterByPath[file.path] }),
		},
	} as never;
}

describe('scanPublishableNotes', () => {
	it('returns notes with confluence_url or confluence_parent_url', () => {
		const files = [
			new TFile('docs/existing.md'),
			new TFile('docs/new-child.md'),
			new TFile('docs/plain.md'),
		];
		const app = createApp(files, {
			'docs/existing.md': { confluence_url: 'https://example/page' },
			'docs/new-child.md': { confluence_parent_url: 'https://example/parent' },
			'docs/plain.md': { title: 'Plain' },
		});

		const result = scanPublishableNotes(app, { frontmatterKey: 'confluence_url', scanFolders: [], ignorePatterns: [] });

		expect(result.map((file) => file.path)).toEqual(['docs/existing.md', 'docs/new-child.md']);
	});

	it('respects scan folders', () => {
		const files = [new TFile('docs/a.md'), new TFile('archive/b.md')];
		const app = createApp(files, {
			'docs/a.md': { confluence_url: 'https://example/a' },
			'archive/b.md': { confluence_url: 'https://example/b' },
		});

		const result = scanPublishableNotes(app, { frontmatterKey: 'confluence_url', scanFolders: ['docs'], ignorePatterns: [] });

		expect(result.map((file) => file.path)).toEqual(['docs/a.md']);
	});

	it('respects ignore patterns and implicitly ignores the Obsidian config directory', () => {
		const files = [new TFile('docs/a.md'), new TFile('templates/t.md'), new TFile('.obsidian/plugins/plugin.md')];
		const app = createApp(files, {
			'docs/a.md': { confluence_url: 'https://example/a' },
			'templates/t.md': { confluence_url: 'https://example/t' },
			'.obsidian/plugins/plugin.md': { confluence_url: 'https://example/plugin' },
		});

		const result = scanPublishableNotes(app, { frontmatterKey: 'confluence_url', scanFolders: [], ignorePatterns: ['templates/**'] });

		expect(result.map((file) => file.path)).toEqual(['docs/a.md']);
	});

	it('supports a custom URL frontmatter key', () => {
		const files = [new TFile('docs/custom.md')];
		const app = createApp(files, {
			'docs/custom.md': { confluence_page_url: 'https://example/custom' },
		});

		const result = scanPublishableNotes(app, { frontmatterKey: 'confluence_page_url', scanFolders: [], ignorePatterns: [] });

		expect(result.map((file) => file.path)).toEqual(['docs/custom.md']);
	});
});
