import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';
import * as obsidianModule from 'obsidian';
import type ConfluencePagePublisherPlugin from './main';
import { ConfluenceApi, type ConfluenceAuthType } from './confluence/api';
import { FrontmatterFields } from './frontmatter/handler';
import { t } from './i18n';

export interface ConfluencePagePublisherSettings {
	// ========== Connection ==========
	/** Example: https://your-domain.atlassian.net/wiki */
	confluenceBaseUrl: string;
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

export class ConfluencePagePublisherSettingTab extends PluginSettingTab {
	plugin: ConfluencePagePublisherPlugin;
	private authResultEl: HTMLElement | null = null;

	constructor(app: App, plugin: ConfluencePagePublisherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.renderSettingsContent();
	}

	private renderSettingsContent(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		this.renderSection(containerEl, t('settings.section.connection'), (el) => {
			new Setting(el)
				.setName(t('settings.baseUrl.name'))
				.setDesc(t('settings.baseUrl.desc'))
				.addText((tx) => tx
					.setPlaceholder('https://xxx.atlassian.net/wiki')
					.setValue(s.confluenceBaseUrl)
					.onChange(async (v) => {
						s.confluenceBaseUrl = v.trim();
						await this.plugin.saveSettings();
					}));

			new Setting(el)
				.setName(t('settings.authType.name'))
				.setDesc(t('settings.authType.desc'))
				.addDropdown((d) => d
					.addOption('basic', t('settings.authType.basic'))
					.addOption('bearer', t('settings.authType.bearer'))
					.setValue(s.authType)
					.onChange(async (v) => {
						s.authType = v as ConfluenceAuthType;
						await this.plugin.saveSettings();
						this.renderSettingsContent();
					}));

			if (s.authType === 'basic') {
				new Setting(el)
					.setName(t('settings.username.name'))
					.setDesc(t('settings.username.desc'))
					.addText((tx) => tx
						.setPlaceholder(t('settings.username.placeholder'))
						.setValue(s.username)
						.onChange(async (v) => {
							s.username = v.trim();
							await this.plugin.saveSettings();
						}));
			}

			this.renderTokenSetting(el);

			new Setting(el)
				.addButton((btn) => btn.setButtonText(t('settings.validate.button')).setCta().onClick(async () => {
					await this.runValidateAuth();
				}));

			this.authResultEl = el.createDiv({ cls: 'confluence-publisher-auth-result' });
		});

		this.renderSection(containerEl, t('settings.section.pageDefaults'), (el) => {
			new Setting(el)
				.setName(t('settings.templateFolder.name'))
				.setDesc(t('settings.templateFolder.desc'))
				.addText((tx) => tx
					.setPlaceholder('Templates')
					.setValue(s.templateFolderPath)
					.onChange(async (v) => {
						s.templateFolderPath = v.trim() || 'templates';
						await this.plugin.saveSettings();
					}));

			new Setting(el)
				.setName(t('settings.pageTitleProperty.name'))
				.setDesc(t('settings.pageTitleProperty.desc'))
				.addText((tx) => tx
					.setPlaceholder(FrontmatterFields.CUSTOM_TITLE)
					.setValue(s.confluencePageTitlePropertyKey)
					.onChange(async (v) => {
						s.confluencePageTitlePropertyKey = v.trim();
						await this.plugin.saveSettings();
					}));

			new Setting(el)
				.setName(t('settings.autoInstallTemplate.name'))
				.setDesc(t('settings.autoInstallTemplate.desc'))
				.addToggle((tx) => tx.setValue(s.autoInstallTemplate).onChange(async (v) => {
					s.autoInstallTemplate = v;
					await this.plugin.saveSettings();
				}));

			new Setting(el)
				.addButton((btn) => btn.setButtonText(t('settings.writeTemplateNow')).setCta().onClick(async () => {
					const ok = await this.plugin.installTemplateFile(true);
					new Notice(ok ? t('notice.templateWritten') : t('notice.templateWriteFailed'));
				}));
		});

		this.renderSection(containerEl, t('settings.section.publishingScope'), (el) => {
			new Setting(el)
				.setName(t('settings.scanFolders.name'))
				.setDesc(t('settings.scanFolders.desc'))
				.then((setting) => {
					const ta = setting.controlEl.createEl('textarea', { cls: 'confluence-publisher-textarea' });
					ta.value = s.scanFolders.join('\n');
					ta.addEventListener('change', () => {
						s.scanFolders = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
						void this.plugin.saveSettings();
					});
				});

			new Setting(el)
				.setName(t('settings.ignore.name'))
				.setDesc(t('settings.ignore.desc'))
				.then((setting) => {
					const ta = setting.controlEl.createEl('textarea', { cls: 'confluence-publisher-textarea' });
					ta.value = s.ignorePatterns.join('\n');
					ta.addEventListener('change', () => {
						s.ignorePatterns = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
						void this.plugin.saveSettings();
					});
				});

			new Setting(el)
				.addButton((btn) => btn.setButtonText(t('settings.publishAllNow')).setCta().onClick(async () => {
					await this.plugin.publishAll();
				}));
		});

		this.renderSection(containerEl, t('settings.section.metadata'), (el) => {
			new Setting(el)
				.setName(t('settings.frontmatterKey.name'))
				.setDesc(t('settings.frontmatterKey.desc'))
				.addText((tx) => tx
					.setPlaceholder(FrontmatterFields.URL)
					.setValue(s.frontmatterKey)
					.onChange(async (v) => {
						s.frontmatterKey = v.trim() || FrontmatterFields.URL;
						await this.plugin.saveSettings();
					}));

			el.createEl('p', {
				text: t('settings.frontmatterMapping.desc'),
				cls: 'setting-item-description',
			});
		});

		this.renderSection(containerEl, t('settings.section.publishingAssets'), (el) => {
			new Setting(el)
				.setName(t('settings.uploadAttachments.name'))
				.setDesc(t('settings.uploadAttachments.desc'))
				.addToggle((tx) => tx.setValue(s.uploadAttachments).onChange(async (v) => {
					s.uploadAttachments = v;
					await this.plugin.saveSettings();
				}));

			new Setting(el)
				.setName(t('settings.maxAttachmentSize.name'))
				.setDesc(t('settings.maxAttachmentSize.desc'))
				.addText((tx) => tx
					.setValue(String(s.maxAttachmentSizeMB))
					.onChange(async (v) => {
						const n = parseFloat(v);
						s.maxAttachmentSizeMB = isNaN(n) || n <= 0 ? 10 : n;
						await this.plugin.saveSettings();
					}));
		});

		this.renderSection(containerEl, t('settings.section.contentConversion'), (el) => {
			el.createEl('p', {
				text: t('settings.diagramsIntro'),
				cls: 'setting-item-description',
			});

			new Setting(el)
				.setName(t('settings.mermaid.toggleName'))
				.setDesc(t('settings.mermaid.toggleDesc'))
				.addToggle((tx) => tx.setValue(s.renderMermaidToPng).onChange(async (v) => {
					s.renderMermaidToPng = v;
					await this.plugin.saveSettings();
					this.plugin.rebuildPublishEngine();
				}));

			new Setting(el)
				.setName(t('settings.mermaid.urlName'))
				.setDesc(t('settings.mermaid.urlDesc'))
				.addText((tx) => tx
					.setPlaceholder('https://kroki.io/mermaid/png')
					.setValue(s.mermaidRenderUrl)
					.onChange(async (v) => {
						s.mermaidRenderUrl = v.trim() || DEFAULT_SETTINGS.mermaidRenderUrl;
						await this.plugin.saveSettings();
						this.plugin.rebuildPublishEngine();
					}));

			new Setting(el)
				.setName(t('settings.plantuml.toggleName'))
				.setDesc(t('settings.plantuml.toggleDesc'))
				.addToggle((tx) => tx.setValue(s.renderPlantUmlToPng).onChange(async (v) => {
					s.renderPlantUmlToPng = v;
					await this.plugin.saveSettings();
					this.plugin.rebuildPublishEngine();
				}));

			new Setting(el)
				.setName(t('settings.plantuml.urlName'))
				.setDesc(t('settings.plantuml.urlDesc'))
				.addText((tx) => tx
					.setPlaceholder('https://www.plantuml.com/plantuml')
					.setValue(s.plantUmlServerUrl)
					.onChange(async (v) => {
						s.plantUmlServerUrl = v.trim() || DEFAULT_SETTINGS.plantUmlServerUrl;
						await this.plugin.saveSettings();
						this.plugin.rebuildPublishEngine();
					}));
		});

		this.renderSection(containerEl, t('settings.section.interface'), (el) => {
			new Setting(el)
				.setName(t('settings.showStatusBar.name'))
				.addToggle((tx) => tx.setValue(s.showStatusBar).onChange(async (v) => {
					s.showStatusBar = v;
					await this.plugin.saveSettings();
					this.plugin.updateStatusBarVisibility();
				}));

			new Setting(el)
				.setName(t('settings.showNotice.name'))
				.setDesc(t('settings.showNotice.desc'))
				.addToggle((tx) => tx.setValue(s.showNotice).onChange(async (v) => {
					s.showNotice = v;
					await this.plugin.saveSettings();
				}));
		});
	}

	private renderSection(parent: HTMLElement, title: string, build: (el: HTMLElement) => void): void {
		const section = parent.createDiv({ cls: 'confluence-publisher-section' });
		new Setting(section).setName(title).setHeading();
		build(section);
	}

	private renderTokenSetting(parent: HTMLElement): void {
		const isBearer = this.plugin.settings.authType === 'bearer';
		const setting = new Setting(parent)
			.setName(isBearer ? t('settings.token.nameBearer') : t('settings.token.nameBasic'))
			.setDesc(isBearer ? t('settings.token.descBearer') : t('settings.token.descBasic'));
		const SecretComponentCtor = (obsidianModule as unknown as {
			SecretComponent?: new (app: App, el: HTMLElement) => { setValue(v: string): unknown; onChange(fn: (v: string) => void): unknown };
		}).SecretComponent;
		const addComponent = (setting as unknown as { addComponent?: (fn: (el: HTMLElement) => unknown) => Setting }).addComponent;

		if (typeof addComponent === 'function' && SecretComponentCtor) {
			addComponent.call(setting, (compEl: HTMLElement) => {
				const comp = new SecretComponentCtor(this.app, compEl);
				comp.setValue(this.plugin.settings.apiToken);
				comp.onChange((value: string) => {
					this.plugin.settings.apiToken = value.trim();
					void this.plugin.saveSettings();
				});
				return comp;
			});
		} else {
			setting.addText((tx) => tx
				.setPlaceholder(t('settings.token.placeholderSecretName'))
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (v) => {
					this.plugin.settings.apiToken = v.trim();
					await this.plugin.saveSettings();
				}));
		}

		const hint = parent.createDiv({ cls: 'confluence-publisher-keyvault-hint' });
		hint.createSpan({ text: t('settings.token.hintLabel'), cls: 'confluence-publisher-keyvault-hint-label' });
		hint.createSpan({ text: t('settings.token.hintBody') });
	}

	private async runValidateAuth(): Promise<void> {
		if (!this.authResultEl) return;
		this.authResultEl.removeClass('ok', 'error');
		this.authResultEl.setText(t('settings.validate.pending'));
		try {
			const tokenValue = await this.plugin.getApiTokenValue();
			const s = this.plugin.settings;
			const needsUsername = s.authType === 'basic';
			if (!s.confluenceBaseUrl || (needsUsername && !s.username) || !tokenValue) {
				this.authResultEl.addClass('error');
				this.authResultEl.setText(needsUsername ? t('settings.validate.missingBasic') : t('settings.validate.missingBearer'));
				return;
			}
			const api = new ConfluenceApi({
				baseUrl: s.confluenceBaseUrl,
				authType: s.authType,
				username: s.username,
				apiToken: tokenValue,
			});
			const r = await api.validateAuth();
			if (r.ok) {
				this.authResultEl.addClass('ok');
				this.authResultEl.setText(t('settings.validate.ok', { name: r.displayName ?? '' }));
			} else {
				this.authResultEl.addClass('error');
				this.authResultEl.setText(t('settings.validate.fail', { error: r.error ?? '' }));
			}
		} catch (e) {
			this.authResultEl.addClass('error');
			this.authResultEl.setText(t('settings.validate.exception', { error: e instanceof Error ? e.message : String(e) }));
		}
	}
}

