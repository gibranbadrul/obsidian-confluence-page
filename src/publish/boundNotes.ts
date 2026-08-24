import type { App, TFile, TFolder } from 'obsidian';
import { TFile as TFileClass, TFolder as TFolderClass } from 'obsidian';
import { hasPublishingBinding } from '../frontmatter/handler';

export function fileIsBound(app: App, frontmatterKey: string, file: TFile): boolean {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return fm ? hasPublishingBinding(fm, frontmatterKey) : false;
}

/** Recursively collects all bound Markdown files under a folder. */
export function collectBoundFilesUnder(app: App, frontmatterKey: string, folder: TFolder): TFile[] {
	const out: TFile[] = [];
	const walk = (f: TFolder) => {
		for (const child of f.children) {
			if (child instanceof TFolderClass) walk(child);
			else if (child instanceof TFileClass && child.extension === 'md' && fileIsBound(app, frontmatterKey, child)) {
				out.push(child);
			}
		}
	};
	walk(folder);
	return out;
}

/** Returns whether a folder contains at least one bound note. Used to decide whether the file menu item should be shown. */
export function folderHasBoundFile(app: App, frontmatterKey: string, folder: TFolder): boolean {
	const stack: TFolder[] = [folder];
	while (stack.length > 0) {
		const f = stack.pop()!;
		for (const child of f.children) {
			if (child instanceof TFolderClass) stack.push(child);
			else if (child instanceof TFileClass && child.extension === 'md' && fileIsBound(app, frontmatterKey, child)) {
				return true;
			}
		}
	}
	return false;
}
