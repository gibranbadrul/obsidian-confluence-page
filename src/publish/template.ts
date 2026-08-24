import { type App, normalizePath, TFile, TFolder } from 'obsidian';
import { FrontmatterFields } from '../frontmatter/handler';
import { type Logger } from '../utils/logger';
import { t } from '../i18n';

const TEMPLATE_FILENAME = 'confluence-note.md';

export function buildTemplateContent(): string {
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

export async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path) return;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return;
	try {
		await app.vault.createFolder(path);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (/already exists/i.test(msg)) return;
		throw e;
	}
}

/** Writes confluence-note.md into the configured template folder. force=true overwrites existing content. */
export async function installTemplateFile(app: App, logger: Logger, templateFolderPath: string, force: boolean): Promise<boolean> {
	try {
		const folder = normalizePath(templateFolderPath || 'templates');
		await ensureFolder(app, folder);

		const fullPath = `${folder}/${TEMPLATE_FILENAME}`;
		const existing = app.vault.getAbstractFileByPath(fullPath);
		const content = buildTemplateContent();

		if (existing instanceof TFile) {
			if (!force) return true;
			await app.vault.modify(existing, content);
		} else {
			await app.vault.create(fullPath, content);
		}

		logger.info(`Template written: ${fullPath}`);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		// Another operation may have created the template after the initial existence check.
		if (/already exists/i.test(message)) return true;

		logger.error('Failed to write template', message);
		return false;
	}
}
