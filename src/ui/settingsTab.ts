import { type App, Notice, PluginSettingTab, type Setting, type SettingDefinitionItem, type SettingGroupItem } from 'obsidian';
import * as obsidianModule from 'obsidian';
import type ConfluencePagePublisherPlugin from '../main';
import { ConfluenceApi } from '../confluence/api';
import { FrontmatterFields } from '../frontmatter/handler';
import {
	DEFAULT_SETTINGS,
	type ConfluencePagePublisherSettings,
	normalizeConfluenceInstanceType,
	parseMultilineSettingValue,
	readStringSettingValue,
	REBUILD_PUBLISH_ENGINE_KEYS,
} from '../settings';
import { t } from '../i18n';

export class ConfluencePagePublisherSettingTab extends PluginSettingTab {
	plugin: ConfluencePagePublisherPlugin;
	private authResultEl: HTMLElement | null = null;

	constructor(app: App, plugin: ConfluencePagePublisherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** Obsidian 1.13.0+ declarative settings used for rendering and global settings search. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const sectionClass = 'confluence-publisher-section';
		const group = (heading: string, items: SettingGroupItem[]): SettingDefinitionItem => ({
			type: 'group',
			heading,
			cls: sectionClass,
			items,
		});

		return [
			group(t('settings.section.connection'), [
				{
					name: t('settings.baseUrl.name'),
					desc: t('settings.baseUrl.desc'),
					control: {
						type: 'text',
						key: 'confluenceBaseUrl',
						placeholder: 'https://example.atlassian.net/wiki',
					},
				},
				{
					name: t('settings.confluenceInstanceType.name'),
					desc: t('settings.confluenceInstanceType.desc'),
					control: {
						type: 'dropdown',
						key: 'confluenceInstanceType',
						options: {
							cloud: t('settings.confluenceInstanceType.cloud'),
							'server-data-center': t('settings.confluenceInstanceType.serverDataCenter'),
						},
					},
				},
				{
					name: t('settings.authType.name'),
					desc: t('settings.authType.desc'),
					control: {
						type: 'dropdown',
						key: 'authType',
						options: {
							basic: t('settings.authType.basic'),
							bearer: t('settings.authType.bearer'),
						},
					},
				},
				{
					name: t('settings.username.name'),
					desc: t('settings.username.desc'),
					visible: () => this.plugin.settings.authType === 'basic',
					control: {
						type: 'text',
						key: 'username',
						placeholder: t('settings.username.placeholder'),
					},
				},
				{
					...this.tokenSettingLabel(),
					render: (setting) => this.configureTokenSetting(setting),
				},
				{
					name: t('settings.validate.button'),
					render: (setting) => {
						this.renderActionButton(setting, t('settings.validate.button'), () => this.runValidateAuth());
						setting.settingEl.addClass('confluence-publisher-setting-wrap');
						this.authResultEl = setting.settingEl.createDiv({ cls: 'confluence-publisher-auth-result' });
					},
				},
			]),
			group(t('settings.section.pageDefaults'), [
				{
					name: t('settings.templateFolder.name'),
					desc: t('settings.templateFolder.desc'),
					control: {
						type: 'text',
						key: 'templateFolderPath',
						placeholder: 'Templates',
					},
				},
				{
					name: t('settings.pageTitleProperty.name'),
					desc: t('settings.pageTitleProperty.desc'),
					control: {
						type: 'text',
						key: 'confluencePageTitlePropertyKey',
						placeholder: FrontmatterFields.CUSTOM_TITLE,
					},
				},
				{
					name: t('settings.autoInstallTemplate.name'),
					desc: t('settings.autoInstallTemplate.desc'),
					control: {
						type: 'toggle',
						key: 'autoInstallTemplate',
					},
				},
				{
					name: t('settings.writeTemplateNow'),
					render: (setting) => this.renderActionButton(setting, t('settings.writeTemplateNow'), async () => {
						const written = await this.plugin.installTemplateFile(true);
						new Notice(written ? t('notice.templateWritten') : t('notice.templateWriteFailed'));
					}),
				},
			]),
			group(t('settings.section.publishingScope'), [
				{
					name: t('settings.scanFolders.name'),
					desc: t('settings.scanFolders.desc'),
					control: {
						type: 'textarea',
						key: 'scanFoldersText',
						rows: 4,
					},
				},
				{
					name: t('settings.ignore.name'),
					desc: t('settings.ignore.desc'),
					control: {
						type: 'textarea',
						key: 'ignorePatternsText',
						rows: 4,
					},
				},
				{
					name: t('settings.publishAllNow'),
					render: (setting) => this.renderActionButton(setting, t('settings.publishAllNow'), () => this.plugin.publishAll()),
				},
			]),
			group(t('settings.section.metadata'), [
				{
					name: t('settings.frontmatterKey.name'),
					desc: `${t('settings.frontmatterKey.desc')} ${t('settings.frontmatterMapping.desc')}`,
					control: {
						type: 'text',
						key: 'frontmatterKey',
						placeholder: FrontmatterFields.URL,
					},
				},
			]),
			group(t('settings.section.publishingAssets'), [
				{
					name: t('settings.uploadAttachments.name'),
					desc: t('settings.uploadAttachments.desc'),
					control: {
						type: 'toggle',
						key: 'uploadAttachments',
					},
				},
				{
					name: t('settings.maxAttachmentSize.name'),
					desc: t('settings.maxAttachmentSize.desc'),
					control: {
						type: 'number',
						key: 'maxAttachmentSizeMB',
						defaultValue: 10,
						min: 0.1,
						step: 'any',
					},
				},
			]),
			group(t('settings.section.contentConversion'), [
				{
					name: t('settings.mermaid.toggleName'),
					desc: `${t('settings.diagramsIntro')} ${t('settings.mermaid.toggleDesc')}`,
					control: {
						type: 'toggle',
						key: 'renderMermaidToPng',
					},
				},
				{
					name: t('settings.mermaid.urlName'),
					desc: t('settings.mermaid.urlDesc'),
					control: {
						type: 'text',
						key: 'mermaidRenderUrl',
						placeholder: DEFAULT_SETTINGS.mermaidRenderUrl,
					},
				},
				{
					name: t('settings.plantuml.toggleName'),
					desc: t('settings.plantuml.toggleDesc'),
					control: {
						type: 'toggle',
						key: 'renderPlantUmlToPng',
					},
				},
				{
					name: t('settings.plantuml.urlName'),
					desc: t('settings.plantuml.urlDesc'),
					control: {
						type: 'text',
						key: 'plantUmlServerUrl',
						placeholder: DEFAULT_SETTINGS.plantUmlServerUrl,
					},
				},
			]),
			group(t('settings.section.interface'), [
				{
					name: t('settings.showStatusBar.name'),
					control: {
						type: 'toggle',
						key: 'showStatusBar',
					},
				},
				{
					name: t('settings.showNotice.name'),
					desc: t('settings.showNotice.desc'),
					control: {
						type: 'toggle',
						key: 'showNotice',
					},
				},
			]),
		];
	}

	getControlValue(key: string): unknown {
		if (key === 'scanFoldersText') return this.plugin.settings.scanFolders.join('\n');
		if (key === 'ignorePatternsText') return this.plugin.settings.ignorePatterns.join('\n');
		return this.plugin.settings[key as keyof ConfluencePagePublisherSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;

		switch (key) {
			case 'confluenceBaseUrl':
				settings.confluenceBaseUrl = readStringSettingValue(value).trim();
				await this.saveCredentialsAndRefresh();
				return;
			case 'confluenceInstanceType':
				settings.confluenceInstanceType = normalizeConfluenceInstanceType(value);
				break;
			case 'authType':
				settings.authType = value === 'bearer' ? 'bearer' : 'basic';
				await this.saveCredentialsAndRefresh();
				this.update();
				return;
			case 'username':
				settings.username = readStringSettingValue(value).trim();
				await this.saveCredentialsAndRefresh();
				return;
			case 'templateFolderPath':
				settings.templateFolderPath = readStringSettingValue(value).trim() || 'templates';
				break;
			case 'confluencePageTitlePropertyKey':
				settings.confluencePageTitlePropertyKey = readStringSettingValue(value).trim();
				break;
			case 'autoInstallTemplate':
				settings.autoInstallTemplate = value === true;
				break;
			case 'scanFoldersText':
				settings.scanFolders = parseMultilineSettingValue(value);
				break;
			case 'ignorePatternsText':
				settings.ignorePatterns = parseMultilineSettingValue(value);
				break;
			case 'frontmatterKey':
				settings.frontmatterKey = readStringSettingValue(value).trim() || FrontmatterFields.URL;
				break;
			case 'uploadAttachments':
				settings.uploadAttachments = value === true;
				break;
			case 'maxAttachmentSizeMB': {
				const parsedSize = typeof value === 'number' ? value : Number.parseFloat(readStringSettingValue(value));
				settings.maxAttachmentSizeMB = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 10;
				break;
			}
			case 'renderMermaidToPng':
				settings.renderMermaidToPng = value === true;
				break;
			case 'mermaidRenderUrl':
				settings.mermaidRenderUrl = readStringSettingValue(value).trim() || DEFAULT_SETTINGS.mermaidRenderUrl;
				break;
			case 'renderPlantUmlToPng':
				settings.renderPlantUmlToPng = value === true;
				break;
			case 'plantUmlServerUrl':
				settings.plantUmlServerUrl = readStringSettingValue(value).trim() || DEFAULT_SETTINGS.plantUmlServerUrl;
				break;
			case 'showStatusBar':
				settings.showStatusBar = value === true;
				break;
			case 'showNotice':
				settings.showNotice = value === true;
				break;
			default:
				throw new Error(`Unsupported setting key: ${key}`);
		}

		await this.plugin.saveSettings();
		if (REBUILD_PUBLISH_ENGINE_KEYS.has(key)) this.plugin.rebuildPublishEngine();
		if (key === 'showStatusBar') this.plugin.updateStatusBarVisibility();
	}

	private tokenSettingLabel(): { name: string; desc: string } {
		const isBearer = this.plugin.settings.authType === 'bearer';
		return {
			name: isBearer ? t('settings.token.nameBearer') : t('settings.token.nameBasic'),
			desc: isBearer ? t('settings.token.descBearer') : t('settings.token.descBasic'),
		};
	}

	/** Renders a name-only action button row (validate, write template, publish all). */
	private renderActionButton(setting: Setting, label: string, onClick: () => void | Promise<void>): void {
		setting
			.setName(label)
			.addButton((button) => button
				.setButtonText(label)
				.setCta()
				.onClick(async () => {
					await onClick();
				}));
	}

	private configureTokenSetting(setting: Setting): void {
		const { name, desc } = this.tokenSettingLabel();
		setting.setName(name).setDesc(desc);
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
					void this.saveCredentialsAndRefresh();
				});
				return comp;
			});
		} else {
			setting.addText((text) => text
				.setPlaceholder(t('settings.token.placeholderSecretName'))
				.setValue(this.plugin.settings.apiToken)
				.onChange(async (value) => {
					this.plugin.settings.apiToken = value.trim();
					await this.saveCredentialsAndRefresh();
				}));
		}

		setting.settingEl.addClass('confluence-publisher-setting-wrap');
		const hint = setting.settingEl.createDiv({ cls: 'confluence-publisher-keyvault-hint' });
		hint.createSpan({ text: t('settings.token.hintLabel'), cls: 'confluence-publisher-keyvault-hint-label' });
		hint.createSpan({ text: t('settings.token.hintBody') });
	}

	private async saveCredentialsAndRefresh(): Promise<void> {
		await this.plugin.saveSettings();
		await this.plugin.refreshCredentials();
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
