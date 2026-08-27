import { type ConfluenceAuthType } from './confluence/api';
import { FrontmatterFields } from './frontmatter/handler';

export type ConfluenceInstanceType = 'cloud' | 'server-data-center';

export interface ConfluencePagePublisherSettings {
	// ========== Connection ==========
	/** Example: https://your-domain.atlassian.net/wiki */
	confluenceBaseUrl: string;
	/** Controls platform-specific behavior such as Cloud-only folder parents. */
	confluenceInstanceType: ConfluenceInstanceType;
	/** Authentication mode: Basic username/password-token or Bearer PAT. */
	authType: ConfluenceAuthType;
	/** Required for Basic auth. Cloud uses email; Server usually uses a domain account. */
	username: string;
	/** SecretStorage key name. The plain token is never stored in plugin settings. */
	apiToken: string;

	// ========== Publishing scope ==========
	/** Vault-relative folders to publish. Empty means the whole vault. */
	scanFolders: string[];
	/** Glob patterns skipped by the publisher. */
	ignorePatterns: string[];

	// ========== Page defaults ==========
	templateFolderPath: string;
	autoInstallTemplate: boolean;
	/** Frontmatter property used as the Confluence page title. Empty uses the note filename. */
	confluencePageTitlePropertyKey: string;

	// ========== Interface ==========
	showStatusBar: boolean;
	showNotice: boolean;
	/** Shows a toolbar below a standalone image-embed line when the cursor is on it, to set size/align/border without typing the `|` syntax. */
	showImageAttributesToolbar: boolean;

	// ========== Publishing metadata ==========
	/** Frontmatter field that stores the target Confluence page URL. */
	frontmatterKey: string;

	// ========== Publishing assets ==========
	uploadAttachments: boolean;
	maxAttachmentSizeMB: number;

	// ========== Content conversion ==========
	renderMermaidToPng: boolean;
	mermaidRenderUrl: string;
	renderPlantUmlToPng: boolean;
	plantUmlServerUrl: string;
}

export const DEFAULT_SETTINGS: ConfluencePagePublisherSettings = {
	confluenceBaseUrl: '',
	confluenceInstanceType: 'cloud',
	authType: 'basic',
	username: '',
	apiToken: '',

	scanFolders: [],
	// Obsidian config directory is ignored implicitly by scanPublishableNotes.
	ignorePatterns: ['.trash/**', 'templates/**'],

	templateFolderPath: 'templates',
	autoInstallTemplate: true,
	confluencePageTitlePropertyKey: FrontmatterFields.CUSTOM_TITLE,

	showStatusBar: true,
	showNotice: true,
	showImageAttributesToolbar: true,

	frontmatterKey: FrontmatterFields.URL,

	uploadAttachments: true,
	maxAttachmentSizeMB: 10,

	renderMermaidToPng: true,
	mermaidRenderUrl: 'https://kroki.io/mermaid/png',
	renderPlantUmlToPng: false,
	plantUmlServerUrl: 'https://www.plantuml.com/plantuml',
};

export function normalizeSettings(settings: ConfluencePagePublisherSettings): ConfluencePagePublisherSettings {
	return {
		...settings,
		confluenceInstanceType: normalizeConfluenceInstanceType(settings.confluenceInstanceType),
		frontmatterKey: normalizeFrontmatterFieldName(settings.frontmatterKey, FrontmatterFields.URL),
		confluencePageTitlePropertyKey: normalizeFrontmatterFieldName(settings.confluencePageTitlePropertyKey, ''),
	};
}

function normalizeFrontmatterFieldName(value: string, fallback: string): string {
	const fieldName = value.trim();
	if (!fieldName) return fallback;

	const normalized = fieldName
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.toLowerCase();

	switch (normalized) {
		case 'confluence_page_url':
			return FrontmatterFields.URL;
		case 'confluence_parent_page_url':
			return FrontmatterFields.PARENT_URL;
		default:
			return normalized;
	}
}

export function normalizeConfluenceInstanceType(value: unknown): ConfluenceInstanceType {
	return value === 'server-data-center' ? 'server-data-center' : 'cloud';
}

export function readStringSettingValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

export function parseMultilineSettingValue(value: unknown): string[] {
	return readStringSettingValue(value)
		.split('\n')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/** Setting keys whose change requires rebuilding the publish engine. */
export const REBUILD_PUBLISH_ENGINE_KEYS = new Set([
	'renderMermaidToPng',
	'mermaidRenderUrl',
	'renderPlantUmlToPng',
	'plantUmlServerUrl',
]);
