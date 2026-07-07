import { describe, expect, it } from 'vitest';
import { TFile } from '../helpers/obsidian';
import { MarkdownConverter } from '../../src/confluence/markdownConverter';

function createApp(files: TFile[] = []) {
	return {
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string) => files.find((file) => file.path === linkpath || file.name === linkpath) ?? null,
		},
		vault: {
			getFiles: () => files,
		},
	} as never;
}

function createContext(overrides = {}) {
	return {
		attachedFilenames: new Set<string>(),
		mermaidFilenameByHash: new Map<string, string>(),
		plantUmlFilenameByHash: new Map<string, string>(),
		renderMermaidToPng: false,
		renderPlantUmlToPng: false,
		...overrides,
	};
}

describe('MarkdownConverter', () => {
	it('strips frontmatter and converts basic Markdown to Storage XHTML compatible HTML', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('---\nconfluence_url: test\n---\n# Title\n\nHello **world** and `code`.', 'note.md', createContext());

		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<strong>world</strong>');
		expect(html).toContain('<code>code</code>');
		expect(html).not.toContain('confluence_url');
	});

	it('removes internal ignore line and ignore block macros before rendering', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert([
			'Visible before',
			'<!-- confluence:ignore-line --> Hidden line',
			'<!-- confluence:ignore-start -->',
			'Hidden block',
			'<!-- confluence:ignore-end -->',
			'Visible after',
		].join('\n'), 'note.md', createContext());

		expect(html).toContain('Visible before');
		expect(html).toContain('Visible after');
		expect(html).not.toContain('Hidden line');
		expect(html).not.toContain('Hidden block');
	});

	it('converts Obsidian wikilinks to readable text', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('[[Some Note]] and [[Some Note|Readable Alias]]', 'note.md', createContext());

		expect(html).toContain('Some Note');
		expect(html).toContain('Readable Alias');
		expect(html).not.toContain('[[');
	});

	it('converts Obsidian callouts to Confluence structured macros', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('> [!warning] Heads up\n> Be careful.', 'note.md', createContext());

		expect(html).toContain('<ac:structured-macro ac:name="warning">');
		expect(html).toContain('Heads up');
		expect(html).toContain('Be careful');
	});

	it('converts fenced code blocks to Confluence code macros', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('```typescript\nconst value = 1;\n```', 'note.md', createContext());

		expect(html).toContain('<ac:structured-macro ac:name="code">');
		expect(html).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>');
		expect(html).toContain('<![CDATA[const value = 1;]]>');
	});

	it('keeps Obsidian syntax inside code blocks unchanged', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('```markdown\n![[image.png]]\n[[Note|Alias]]\n```', 'note.md', createContext());

		expect(html).toContain('![[image.png]]');
		expect(html).toContain('[[Note|Alias]]');
	});

	it('extracts and renders uploaded local image attachments', async () => {
		const image = new TFile('assets/image.png');
		const converter = new MarkdownConverter(createApp([image]));
		const markdown = '![[assets/image.png|Local image alt]]';
		const refs = await converter.extractReferences(markdown, 'note.md');
		const html = await converter.convert(markdown, 'note.md', createContext({
			attachedFilenames: new Set(refs.attachments.map((ref) => ref.filename)),
		}));

		expect(refs.attachments).toHaveLength(1);
		expect(refs.attachments[0]?.filename).toBe('image.png');
		expect(html).toContain('<ac:image ac:alt="Local image alt">');
		expect(html).toContain('<ri:attachment ri:filename="image.png" />');
	});

	it('passes remote images through as remote image URLs', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('![Remote](https://placehold.co/600x200/png)', 'note.md', createContext());

		expect(html).toContain('<img src="https://placehold.co/600x200/png" alt="Remote" />');
	});

	it('marks missing uploaded local attachments', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('![Missing](missing.png)', 'note.md', createContext());

		expect(html).toContain('<!-- Missing uploaded attachment: missing.png -->');
	});

	it('extracts Mermaid and PlantUML diagram blocks', async () => {
		const converter = new MarkdownConverter(createApp());
		const refs = await converter.extractReferences([
			'```mermaid',
			'flowchart TD',
			'  A --> B',
			'```',
			'```plantuml',
			'@startuml',
			'Alice -> Bob: hi',
			'@enduml',
			'```',
		].join('\n'), 'note.md');

		expect(refs.mermaid).toHaveLength(1);
		expect(refs.plantUml).toHaveLength(1);
		expect(refs.mermaid[0]?.filename).toMatch(/^mermaid-[a-f0-9]{40}\.png$/);
		expect(refs.plantUml[0]?.filename).toMatch(/^plantuml-[a-f0-9]{40}\.png$/);
	});

	it('renders diagram fences as uploaded images when rendered filenames are provided', async () => {
		const converter = new MarkdownConverter(createApp());
		const markdown = ['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n');
		const refs = await converter.extractReferences(markdown, 'note.md');
		const block = refs.mermaid[0]!;
		const html = await converter.convert(markdown, 'note.md', createContext({
			renderMermaidToPng: true,
			mermaidFilenameByHash: new Map([[block.hash, block.filename]]),
		}));

		expect(html).toContain(`<ri:attachment ri:filename="${block.filename}" />`);
	});

	it('falls back to code macro when diagram rendering is enabled but no rendered file exists', async () => {
		const converter = new MarkdownConverter(createApp());
		const html = await converter.convert('```mermaid\nflowchart TD\n  A --> B\n```', 'note.md', createContext({ renderMermaidToPng: true }));

		expect(html).toContain('<ac:structured-macro ac:name="code">');
		expect(html).toContain('<ac:parameter ac:name="language">mermaid</ac:parameter>');
	});

	it('content hash excludes ignored content and includes the page title fingerprint', async () => {
		const converter = new MarkdownConverter(createApp());
		const first = await converter.computeContentHash('Visible\n<!-- confluence:ignore-line --> Hidden A', 'Title A');
		const second = await converter.computeContentHash('Visible\n<!-- confluence:ignore-line --> Hidden B', 'Title A');
		const third = await converter.computeContentHash('Visible\n<!-- confluence:ignore-line --> Hidden B', 'Title B');

		expect(first).toBe(second);
		expect(first).not.toBe(third);
	});
});
