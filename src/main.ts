import {
	type Editor,
	type MarkdownView,
	type Menu,
	Notice,
	Plugin,
	TFile,
	TFolder,
	normalizePath,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	type ConfluencePagePublisherSettings,
	ConfluencePagePublisherSettingTab,
	normalizeSettings,
} from './settings';
import { ConfluenceApi } from './confluence/api';
import { MarkdownConverter } from './confluence/markdownConverter';
import { PublishEngine } from './publish/publishEngine';
import { Logger } from './utils/logger';
import { StatusBarManager } from './ui/statusBar';
import { CreateBoundNoteModal } from './ui/createBoundNoteModal';
import { FrontmatterFields, hasPublishingBinding, insertTemplateFrontmatter } from './frontmatter/handler';
import { PublishStatus } from './types';
import { t } from './i18n';

const TEMPLATE_FILENAME = 'confluence-note.md';

function buildTemplateContent(): string {
	return `---
${FrontmatterFields.URL}:
${FrontmatterFields.PARENT_URL}:
${FrontmatterFields.CUSTOM_TITLE}:
${FrontmatterFields.PAGE_ID}:
${FrontmatterFields.LAST_PUBLISHED}:
${FrontmatterFields.LAST_HASH}:
---

${t('template.title')}

${t('template.usage')}

${t('template.bodyHeading')}

${t('template.bodyPlaceholder')}
`;
}

export default class ConfluencePagePublisherPlugin extends Plugin {
	settings!: ConfluencePagePublisherSettings;
	logger!: Logger;
	statusBar: StatusBarManager | null = null;

	private api: ConfluenceApi | null = null;
	private engine: PublishEngine | null = null;

	async onload() {
		this.logger = new Logger();
		this.logger.info(t('plugin.loading'));

		await this.loadSettings();

		await this.ensureEngine();

		this.addRibbonIcon('cloud-upload', t('plugin.ribbonTooltip'), async () => {
			await this.publishAll();
		});

		this.addSettingTab(new ConfluencePagePublisherSettingTab(this.app, this));
		this.registerCommands();
		this.registerMenuIntegrations();

		if (this.settings.showStatusBar) {
			this.statusBar = new StatusBarManager(this);
			this.statusBar.create();
		}


		if (this.settings.autoInstallTemplate) {
			await this.installTemplateFile(false);
		}


		this.logger.info(t('plugin.loaded'));
	}

	onunload() {
		this.statusBar?.destroy();
		this.logger?.info(t('plugin.unloaded'));
	}

	async loadSettings() {
		const raw = (await this.loadData()) as unknown;
		const data = isStoredPluginData(raw) && isObjectRecord(raw.settings)
			? raw.settings as Partial<ConfluencePagePublisherSettings>
			: isObjectRecord(raw)
				? raw as Partial<ConfluencePagePublisherSettings>
				: {};

		this.settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, data));
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Read the real token value from SecretStorage. settings.apiToken stores only the secret name. */
	async getApiTokenValue(): Promise<string | null> {
		const key = this.settings.apiToken;
		if (!key) return null;
		const storage = (this.app as unknown as { secretStorage?: { getSecret?(key: string): unknown } }).secretStorage;
		if (!storage || typeof storage.getSecret !== 'function') return null;
		try {
			const raw = storage.getSecret(key);
			const value = raw && typeof (raw as { then?: unknown }).then === 'function'
				? await (raw as Promise<unknown>)
				: raw;
			return typeof value === 'string' ? value : null;
		} catch {
			return null;
		}
	}

	private async ensureEngine(): Promise<void> {
		const tokenValue = await this.getApiTokenValue();
		const needsUsername = this.settings.authType === 'basic';
		if (!this.settings.confluenceBaseUrl || (needsUsername && !this.settings.username) || !tokenValue) {
			this.engine = null;
			this.api = null;
			return;
		}
		this.api = new ConfluenceApi({
			baseUrl: this.settings.confluenceBaseUrl,
			authType: this.settings.authType,
			username: this.settings.username,
			apiToken: tokenValue,
		});
		this.engine = new PublishEngine({
			app: this.app,
			settings: this.settings,
			logger: this.logger,
			api: this.api,
		});
	}

	/** Called after settings changes that require renderer rebuilds. */
	rebuildPublishEngine(): void {
		if (this.engine) {
			this.engine.rebuildRenderers();
		} else {
			void this.ensureEngine();
		}
	}

	/** Called after credential settings change to rebuild API and publish engine instances. */
	async refreshCredentials(): Promise<void> {
		await this.ensureEngine();
	}

	// =========== Publishing entry points ===========

	async publishAll(): Promise<void> {
		await this.ensureEngine();
		if (!this.engine) {
			new Notice(t('notice.fillAuthFirst'));
			return;
		}
		this.statusBar?.showPublishing(t('status.publishing'));
		const r = await this.engine.publishAll();
		if (!r) {
			this.statusBar?.update(PublishStatus.Idle);
			return;
		}
		const summary = t('summary.all', { updated: r.updated, skipped: r.skipped, failed: r.failed });
		if (r.failed === 0) {
			this.statusBar?.showSuccess(summary);
			if (this.settings.showNotice && r.total > 0) new Notice(t('notice.publishResult', { summary }));
		} else {
			this.statusBar?.showFailed(summary);
			if (this.settings.showNotice) new Notice(t('notice.publishPartialFail', { summary }));
		}
	}

	async publishCurrentFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			this.logger.warn('Publish current note requested without an active note');
			new Notice(t('notice.noteNotOpen'));
			return;
		}
		this.logger.info(`Publish current note requested: ${file.path}`);
		await this.publishFile(file);
	}

	/** Publishes all bound notes under the given folder recursively. */
	async publishFolder(folder: TFolder): Promise<void> {
		await this.ensureEngine();
		if (!this.engine) {
			new Notice(t('notice.fillAuthFirst'));
			return;
		}
		const files = this.collectBoundFilesUnder(folder);
		if (files.length === 0) {
			new Notice(t('notice.folderNoBoundNotes', { folder: folder.name }));
			return;
		}
		this.statusBar?.showPublishing(folder.name + '/');
		this.logger.info(`Publish folder ${folder.path}: ${files.length} bound notes`);
		const r = await this.engine.publishFiles(files);
		if (!r) { this.statusBar?.update(PublishStatus.Idle); return; }
		const summary = t('summary.folder', {
			folder: folder.name,
			updated: r.updated,
			skipped: r.skipped,
			failed: r.failed,
		});
		if (r.failed === 0) {
			this.statusBar?.showSuccess(summary);
			if (this.settings.showNotice) new Notice(t('notice.publishResult', { summary }));
		} else {
			this.statusBar?.showFailed(summary);
			if (this.settings.showNotice) new Notice(t('notice.publishPartialFail', { summary }));
		}
	}

	async publishFile(file: TFile): Promise<void> {
		this.logger.info(`Publish requested: ${file.path}`);
		await this.ensureEngine();
		if (!this.engine) {
			this.logger.warn('Publish engine is not ready', 'Missing Confluence connection settings or token value');
			new Notice(t('notice.fillAuthFirst'));
			return;
		}
		this.statusBar?.showPublishing(t('status.publishing'));
		const r = await this.engine.publishOne(file);
		if (!r) {
			this.logger.warn(`Publish did not run: ${file.path}`, 'Another publish task is already running');
			this.statusBar?.update(PublishStatus.Idle);
			return;
		}
		if (r.skipped) {
			this.logger.info(`Publish skipped: ${file.path}`, r.error ?? 'No content changes detected');
			this.statusBar?.update(PublishStatus.Idle);
			if (this.settings.showNotice) new Notice(t('notice.publishedNoChange', { file: file.name }));
		} else if (r.success) {
			this.statusBar?.showSuccess();
			if (this.settings.showNotice) new Notice(t('notice.publishedOk', { file: file.name }));
		} else {
			this.statusBar?.showFailed(r.error);
			new Notice(t('notice.publishedFail', { file: file.name, error: r.error ?? '' }));
		}
	}

	// =========== Template ===========

	/** Writes confluence-note.md into the configured template folder. force=true overwrites existing content. */
	async installTemplateFile(force: boolean): Promise<boolean> {
		try {
			const folder = normalizePath(this.settings.templateFolderPath || 'templates');
			await this.ensureFolder(folder);
			const fullPath = folder + '/' + TEMPLATE_FILENAME;
			const existing = this.app.vault.getAbstractFileByPath(fullPath);
			const content = buildTemplateContent();
			if (existing instanceof TFile) {
				if (!force) return true;
				await this.app.vault.modify(existing, content);
			} else {
				try {
					await this.app.vault.create(fullPath, content);
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					if (/already exists/i.test(msg)) return true;
					throw e;
				}
			}
			this.logger.info(`Template written: ${fullPath}`);
			return true;
		} catch (e) {
			this.logger.error('Failed to write template', e instanceof Error ? e.message : String(e));
			return false;
		}
	}

	private async ensureFolder(path: string): Promise<void> {
		if (!path) return;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;
		try {
			await this.app.vault.createFolder(path);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (/already exists/i.test(msg)) return;
			throw e;
		}
	}

	// =========== UI ===========

	updateStatusBarVisibility(): void {
		if (this.settings.showStatusBar && !this.statusBar) {
			this.statusBar = new StatusBarManager(this);
			this.statusBar.create();
		} else if (!this.settings.showStatusBar && this.statusBar) {
			this.statusBar.destroy();
			this.statusBar = null;
		}
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'publish-all',
			name: t('command.publishAll'),
			callback: () => { void this.publishAll(); },
		});
		this.addCommand({
			id: 'publish-current-file',
			name: t('command.publishCurrent'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.publishFile(file);
				return true;
			},
		});
		this.addCommand({
			id: 'insert-template',
			name: t('command.insertTemplate'),
			editorCallback: async (_editor: Editor, view: MarkdownView) => {
				if (!view.file) { new Notice(t('notice.noteNotOpen')); return; }
				const ok = await insertTemplateFrontmatter(this.app, view.file);
				new Notice(ok ? t('notice.frontmatterInsertedShort') : t('notice.frontmatterAlreadyExists'));
			},
		});
		this.addCommand({
			id: 'create-bound-note',
			name: t('command.createBoundNote'),
			callback: () => {
				const modal = new CreateBoundNoteModal(this.app, this.settings.scanFolders[0] ?? '', async (path, url) => {
					await this.ensureFolder(parentOf(path));
					const file = await this.app.vault.create(path, buildTemplateContent());
					await insertTemplateFrontmatter(this.app, file, url);
					await this.app.workspace.openLinkText(file.path, '', false);
					return file;
				});
				modal.open();
			},
		});
		this.addCommand({
			id: 'insert-confluence-ignore-block',
			name: t('command.insertConfluenceIgnoreBlock'),
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (!view.file) { new Notice(t('notice.noteNotOpen')); return; }
				this.insertConfluenceIgnoreBlock(editor);
			},
		});
		this.addCommand({
			id: 'export-storage-preview',
			name: t('command.exportStoragePreview'),
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.exportStoragePreview(file);
				return true;
			},
		});
		this.addCommand({
			id: 'validate-auth',
			name: t('command.validateAuth'),
			callback: async () => {
				const tokenValue = await this.getApiTokenValue();
				const needsUsername = this.settings.authType === 'basic';
				if (!this.settings.confluenceBaseUrl || (needsUsername && !this.settings.username) || !tokenValue) {
					new Notice(t('notice.fillAuthFirst'));
					return;
				}
				const api = new ConfluenceApi({
					baseUrl: this.settings.confluenceBaseUrl,
					authType: this.settings.authType,
					username: this.settings.username,
					apiToken: tokenValue,
				});
				const r = await api.validateAuth();
				new Notice(r.ok
					? t('notice.authOk', { name: r.displayName ?? '' })
					: t('notice.authFail', { error: r.error ?? '' }));
			},
		});
	}

	private insertConfluenceIgnoreBlock(editor: Editor): void {
		const selection = editor.getSelection();
		const cursor = editor.getCursor();
		const prefix = cursor.ch === 0 ? '' : '\n';
		const ignoreBlock = createConfluenceIgnoreBlock(selection);

		editor.replaceSelection(prefix + ignoreBlock + '\n');

		if (!selection) {
			editor.setCursor({
				line: cursor.line + (prefix ? 2 : 1),
				ch: 0,
			});
		}

		new Notice(t('notice.ignoreBlockInserted'));
	}

	private registerMenuIntegrations(): void {
		// Editor context menu: Confluence publishing and macro helpers are grouped together.
		this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
			const file = view.file;
			if (!file || file.extension !== 'md') return;
			this.addConfluenceEditorSubmenu(menu, editor, file);
		}));

		// File explorer context menu: files follow the same rule; folders can publish bound notes recursively.
		this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, fileOrFolder) => {
			if (fileOrFolder instanceof TFolder) {
				if (!this.folderHasBoundFile(fileOrFolder)) return;
				menu.addItem((item) => item
					.setTitle(t('menu.publishFolder'))
					.setIcon('cloud-upload')
					.onClick(() => { void this.publishFolder(fileOrFolder); }));
				return;
			}
			if (!(fileOrFolder instanceof TFile) || fileOrFolder.extension !== 'md') return;
			const file = fileOrFolder;
			if (this.fileIsBound(file)) {
				menu.addItem((item) => item
					.setTitle(t('menu.publishToConfluence'))
					.setIcon('cloud-upload')
					.onClick(() => { void this.publishFile(file); }));
			} else {
				menu.addItem((item) => item
					.setTitle(t('menu.insertFrontmatter'))
					.setIcon('cloud')
					.onClick(async () => {
						const ok = await insertTemplateFrontmatter(this.app, file);
						new Notice(ok ? t('notice.frontmatterInsertedFileMenu') : t('notice.frontmatterAlreadyExists'));
					}));
			}
		}));
	}

	private addConfluenceEditorSubmenu(menu: Menu, editor: Editor, file: TFile): void {
		menu.addItem((item) => {
			const submenuItem = item as unknown as SubmenuCapableMenuItem;
			submenuItem
				.setTitle(t('menu.confluenceGroup'))
				.setIcon('cloud');

			const submenu = typeof submenuItem.setSubmenu === 'function'
				? submenuItem.setSubmenu()
				: null;

			if (submenu) {
				this.addConfluenceEditorMenuItems(submenu, editor, file);
			}
		});
	}

	private addConfluenceEditorMenuItems(menu: Menu, editor: Editor, file: TFile): void {
		menu.addItem((item) => item
			.setTitle(t('menu.publishToConfluence'))
			.setIcon('cloud-upload')
			.onClick(() => { void this.publishFile(file); }));

		menu.addItem((item) => item
			.setTitle(t('menu.addIgnoreBlockMacro'))
			.setIcon('eye-off')
			.onClick(() => { this.insertConfluenceIgnoreBlock(editor); }));
	}

	/**
	 * Runs the current note through the Markdown -> Storage XHTML conversion chain without calling Confluence.
	 * The result is written beside the note as *.preview.xml for XHTML debugging.
	 */
	async exportStoragePreview(file: TFile): Promise<void> {
		try {
			const converter = new MarkdownConverter(this.app);
			const markdown = await this.app.vault.cachedRead(file);
			const refs = await converter.extractReferences(markdown, file.path);
			const xhtml = await converter.convert(markdown, file.path, {
				attachedFilenames: new Set(refs.attachments.map((r) => r.filename)),
				mermaidFilenameByHash: new Map(refs.mermaid.map((b) => [b.hash, b.filename.replace(/\.png$/i, '.svg')])),
				plantUmlFilenameByHash: new Map(refs.plantUml.map((b) => [b.hash, b.filename])),
				renderMermaidToPng: this.settings.renderMermaidToPng,
				renderPlantUmlToPng: this.settings.renderPlantUmlToPng,
			});
			const lines = xhtml.split('\n').map((l, i) => `${String(i + 1).padStart(5, ' ')}  ${l}`).join('\n');
			const previewPath = file.path.replace(/\.md$/i, '.preview.xml');
			const existing = this.app.vault.getAbstractFileByPath(previewPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, lines);
			} else {
				await this.app.vault.create(previewPath, lines);
			}
			new Notice(t('notice.exportPreviewOk', { path: previewPath }));
		} catch (e) {
			new Notice(t('notice.exportPreviewFailed', { error: e instanceof Error ? e.message : String(e) }));
		}
	}

	/** Recursively collects all bound Markdown files under a folder. */
	private collectBoundFilesUnder(folder: TFolder): TFile[] {
		const out: TFile[] = [];
		const walk = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFolder) walk(child);
				else if (child instanceof TFile && child.extension === 'md' && this.fileIsBound(child)) {
					out.push(child);
				}
			}
		};
		walk(folder);
		return out;
	}

	/** Returns whether a folder contains at least one bound note. Used to decide whether the file menu item should be shown. */
	private folderHasBoundFile(folder: TFolder): boolean {
		const stack: TFolder[] = [folder];
		while (stack.length > 0) {
			const f = stack.pop()!;
			for (const child of f.children) {
				if (child instanceof TFolder) stack.push(child);
				else if (child instanceof TFile && child.extension === 'md' && this.fileIsBound(child)) {
					return true;
				}
			}
		}
		return false;
	}

	private fileIsBound(file: TFile): boolean {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		return fm ? hasPublishingBinding(fm, this.settings.frontmatterKey) : false;
	}
}

function isStoredPluginData(value: unknown): value is { settings?: unknown } {
	return isObjectRecord(value) && 'settings' in value;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parentOf(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx > 0 ? path.slice(0, idx) : '';
}

interface SubmenuCapableMenuItem {
	setTitle(title: string): SubmenuCapableMenuItem;
	setIcon(icon: string): SubmenuCapableMenuItem;
	setSubmenu?: () => Menu;
}

function createConfluenceIgnoreBlock(content: string): string {
	const trimmedContent = content.trim();
	if (!trimmedContent) {
		return '<!-- confluence:ignore-start -->\n\n\n<!-- confluence:ignore-end -->';
	}

	return `<!-- confluence:ignore-start -->\n\n${trimmedContent}\n\n<!-- confluence:ignore-end -->`;
}
