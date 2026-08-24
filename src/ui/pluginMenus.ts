import { type Editor, type MarkdownView, type Menu, Notice, TFile, TFolder } from 'obsidian';
import type ConfluencePagePublisherPlugin from '../main';
import { fileIsBound, folderHasBoundFile } from '../publish/boundNotes';
import { insertConfluenceIgnoreBlock, insertConfluenceIgnoreLine, insertConfluenceToc } from '../editor/confluenceMacros';
import { insertTemplateFrontmatter } from '../frontmatter/handler';
import { t } from '../i18n';

interface SubmenuCapableMenuItem {
	setTitle(title: string): SubmenuCapableMenuItem;
	setIcon(icon: string): SubmenuCapableMenuItem;
	setSubmenu?: () => Menu;
}

/** Registers the editor context menu (publish + macro helpers) and file explorer context menu. */
export function registerPluginMenus(plugin: ConfluencePagePublisherPlugin): void {
	// Editor context menu: Confluence publishing and macro helpers are grouped together.
	plugin.registerEvent(plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, view: MarkdownView) => {
		const file = view.file;
		if (!file || file.extension !== 'md') return;
		addConfluenceEditorSubmenu(menu, editor, file, plugin);
	}));

	// File explorer context menu: files follow the same rule; folders can publish bound notes recursively.
	plugin.registerEvent(plugin.app.workspace.on('file-menu', (menu: Menu, fileOrFolder) => {
		if (fileOrFolder instanceof TFolder) {
			if (!folderHasBoundFile(plugin.app, plugin.settings.frontmatterKey, fileOrFolder)) return;
			menu.addItem((item) => item
				.setTitle(t('menu.publishFolder'))
				.setIcon('cloud-upload')
				.onClick(() => { void plugin.publishFolder(fileOrFolder); }));
			return;
		}
		if (!(fileOrFolder instanceof TFile) || fileOrFolder.extension !== 'md') return;
		const file = fileOrFolder;
		if (fileIsBound(plugin.app, plugin.settings.frontmatterKey, file)) {
			menu.addItem((item) => item
				.setTitle(t('menu.publishToConfluence'))
				.setIcon('cloud-upload')
				.onClick(() => { void plugin.publishFile(file); }));
		} else {
			menu.addItem((item) => item
				.setTitle(t('menu.insertFrontmatter'))
				.setIcon('cloud')
				.onClick(async () => {
					const ok = await insertTemplateFrontmatter(plugin.app, file);
					new Notice(ok ? t('notice.frontmatterInsertedFileMenu') : t('notice.frontmatterAlreadyExists'));
				}));
		}
	}));
}

function addConfluenceEditorSubmenu(menu: Menu, editor: Editor, file: TFile, plugin: ConfluencePagePublisherPlugin): void {
	menu.addItem((item) => {
		const submenuItem = item as unknown as SubmenuCapableMenuItem;
		submenuItem
			.setTitle(t('menu.confluenceGroup'))
			.setIcon('cloud');

		const submenu = typeof submenuItem.setSubmenu === 'function'
			? submenuItem.setSubmenu()
			: null;

		if (submenu) {
			addConfluenceEditorMenuItems(submenu, editor, file, plugin);
		}
	});
}

function addConfluenceEditorMenuItems(menu: Menu, editor: Editor, file: TFile, plugin: ConfluencePagePublisherPlugin): void {
	menu.addItem((item) => item
		.setTitle(t('menu.publishToConfluence'))
		.setIcon('cloud-upload')
		.onClick(() => { void plugin.publishFile(file); }));

	menu.addSeparator();

	menu.addItem((item) => item
		.setTitle(t('menu.addIgnoreLineMacro'))
		.setIcon('eye-off')
		.onClick(() => { insertConfluenceIgnoreLine(editor); }));

	menu.addItem((item) => item
		.setTitle(t('menu.addIgnoreBlockMacro'))
		.setIcon('eye-off')
		.onClick(() => { insertConfluenceIgnoreBlock(editor); }));

	menu.addItem((item) => item
		.setTitle(t('menu.addTocMacro'))
		.setIcon('list')
		.onClick(() => { insertConfluenceToc(editor); }));
}
