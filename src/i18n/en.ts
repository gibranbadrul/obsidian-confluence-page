 
// English UI strings. Keys are grouped by surface.
export const en = {
	// ===== Plugin-level =====
	plugin: {
		loading: 'Confluence Page Publisher: loading…',
		loaded: 'Confluence Page Publisher: loaded',
		unloaded: 'Confluence Page Publisher: unloaded',
		ribbonTooltip: 'Publish bound notes to Confluence',
	},

	// ===== Notices =====
	notice: {
		noteNotOpen: 'No active note',
		fillAuthFirst: 'Please configure the Confluence connection in Settings first',
		publishResult: 'Confluence Page Publisher: {summary}',
		publishPartialFail: 'Confluence Page Publisher partial failure: {summary}',
		folderNoBoundNotes: 'No bound notes under {folder}',
		publishedNoChange: 'No changes to publish: {file}',
		publishedOk: 'Published: {file}',
		publishedFail: 'Publish failed: {file}\n{error}',
		frontmatterInserted: 'Publishing metadata inserted; set confluence_url to the target page URL',
		frontmatterInsertedShort: 'Frontmatter inserted',
		frontmatterAlreadyExists: 'This note already has Confluence publishing metadata, skipped',
		frontmatterInsertedFileMenu: 'Publishing metadata inserted; open the note and set confluence_url to the target page URL',
		authOk: 'Authentication ok: {name}',
		authFail: 'Authentication failed: {error}',
		templateWritten: 'Template written',
		templateWriteFailed: 'Failed to write template, see console',
		exportPreviewOk: 'Storage preview exported: {path}',
		exportPreviewFailed: 'Failed to export preview: {error}',
		pathRequired: 'Please fill in the note path',
		urlRequired: 'Please fill in the Confluence URL',
		urlCannotParsePageId: 'Cannot parse page ID from URL',
		createFailed: 'Create failed: {error}',
		ignoreBlockInserted: 'Confluence ignore block macro inserted',
	},

	// ===== Summary fragments =====
	summary: {
		all: 'published {updated} / skipped {skipped} / failed {failed}',
		folder: '{folder}/: published {updated} / skipped {skipped} / failed {failed}',
	},

	// ===== Commands =====
	command: {
		publishAll: 'Publish all bound notes',
		publishCurrent: 'Publish current note',
		insertTemplate: 'Insert Confluence frontmatter into current note',
		insertConfluenceIgnoreBlock: 'Add ignore block macro',
		createBoundNote: 'Create bound note',
		exportStoragePreview: 'Export storage preview of current note',
		validateAuth: 'Validate credentials',
	},

	// ===== Context menus =====
	menu: {
		confluenceGroup: 'Confluence',
		publishToConfluence: 'Publish to Confluence',
		insertFrontmatter: 'Insert Confluence frontmatter',
		addIgnoreBlockMacro: 'Add ignore block macro',
		publishFolder: 'Publish folder to Confluence',
	},

	// ===== Status bar =====
	status: {
		idle: '☁ Idle',
		publishing: '☁ Publishing',
		success: '☁ Published',
		failed: '☁ Failed',
		tooltipIdle: 'Confluence Page Publisher: idle{lastSuffix}',
		tooltipLastPublish: ' — last publish: {time}',
		tooltipPublishing: 'Confluence Page Publisher: publishing…',
		tooltipSuccess: 'Confluence Page Publisher: published — {time}',
		tooltipFailed: 'Confluence Page Publisher: failed',
		tooltipFailedWithError: 'Publish failed: {error}',
		publishingLabelPrefix: '☁ {text}',
	},

	// ===== Settings tab =====
	settings: {
		section: {
			connection: 'Connection profile',
			pageDefaults: 'Page defaults',
			publishingScope: 'Publishing scope',
			metadata: 'Publishing metadata',
			publishingAssets: 'Publishing assets',
			contentConversion: 'Content conversion',
			interface: 'Interface',
		},
		baseUrl: {
			name: 'Confluence base URL',
			desc: 'Cloud looks like https://xxx.atlassian.net/wiki; Server usually has no /wiki suffix, e.g. https://confluence.your-corp.com',
		},
		authType: {
			name: 'Authentication type',
			desc: 'Basic: username + password/API token. Use this for Cloud (email + API token) and Server with classic accounts (domain account + password). Bearer: Personal Access Token. Use this for Server 7.9+ / DC with PAT enabled, or Cloud OAuth Bearer.',
			basic: 'Basic (username + password/token)',
			bearer: 'Bearer (Personal Access Token)',
		},
		username: {
			name: 'Account (username / email)',
			desc: 'Cloud: your Atlassian email. Server: your domain account (e.g. john.doe).',
			placeholder: 'you@example.com or domain account',
		},
		token: {
			nameBasic: 'Password / API token',
			nameBearer: 'Personal Access Token',
			descBasic: 'Pick a secret already stored in the key vault. Cloud uses an Atlassian API Token; Server with classic accounts uses the login password.',
			descBearer: 'Pick a PAT already stored in the key vault (create one at Confluence → Profile → Personal Access Tokens).',
			placeholderSecretName: 'Secret name (requires Obsidian 1.11.4+ key vault)',
			hintLabel: 'Create a secret:',
			hintBody: ' Settings → Key vault → Create new secret. Generate the token at Atlassian account → Security → API tokens and paste it as the secret value.',
		},
		validate: {
			button: 'Validate credentials',
			pending: 'Validating…',
			missingBasic: 'Please fill in base URL / account / token first',
			missingBearer: 'Please fill in base URL / PAT first',
			ok: 'Authentication ok: {name}',
			fail: 'Authentication failed: {error}',
			exception: 'Validation error: {error}',
		},
		publishAllNow: 'Publish all bound notes now',
		scanFolders: {
			name: 'Scan folders (optional)',
			desc: 'One folder per line, relative to vault root. Empty = allow publishing from the whole vault.',
		},
		ignore: {
			name: 'Ignore patterns',
			desc: 'One glob per line. Matching notes are excluded from publishing.',
		},
		templateFolder: {
			name: 'Template folder',
			desc: 'Where the publisher template file is stored, relative to vault root.',
		},
		pageTitleProperty: {
			name: 'Confluence page title property',
			desc: 'Frontmatter property used as the Confluence page title. Leave empty to use the note filename. Example: confluence_title.',
		},
		autoInstallTemplate: {
			name: 'Auto-install template',
			desc: 'On load, write confluence-note.md into the template folder if missing.',
		},
		writeTemplateNow: 'Write template now',
		uploadAttachments: {
			name: 'Upload local attachments',
			desc: 'When enabled, local embeds such as ![[image.png]] are uploaded as Confluence attachments.',
		},
		maxAttachmentSize: {
			name: 'Max attachment size (MB)',
			desc: 'Attachments larger than this are skipped',
		},
		diagramsIntro:
			'When enabled, matching code blocks are pre-rendered via a rendering service and uploaded as PNG attachments. When disabled, the code block is pushed as-is and rendered by a Confluence-side macro or shown as source.',
		mermaid: {
			toggleName: 'Mermaid → PNG',
			toggleDesc: 'POSTs the Mermaid source to the Kroki endpoint below and uploads the returned PNG.',
			urlName: 'Mermaid render service URL',
			urlDesc: 'Full URL. Default https://kroki.io/mermaid/png (public instance); set this to a self-hosted Kroki service for corporate networks.',
		},
		plantuml: {
			toggleName: 'PlantUML → PNG',
			toggleDesc: 'Renders via a PlantUML server. The public plantuml.com instance can be rate-limited.',
			urlName: 'PlantUML server URL',
			urlDesc: 'No trailing slash, e.g. https://www.plantuml.com/plantuml or a self-hosted instance.',
		},
		showStatusBar: {
			name: 'Show status bar',
		},
		showNotice: {
			name: 'Show notices',
			desc: 'Show a notice when a publish operation finishes or fails.',
		},
		frontmatterKey: {
			name: 'Frontmatter key name',
			desc: 'Advanced: frontmatter field used to store the target Confluence page URL. Defaults to confluence_url.',
		},
		frontmatterMapping: {
			desc: 'Publisher metadata uses snake_case fields: confluence_url, confluence_parent_url, confluence_page_id, confluence_title, confluence_last_published_at, confluence_content_hash, and confluence_attachments.',
		},
	},

	// ===== Modals =====
	modal: {
		createBoundNote: {
			title: 'Create a note bound to Confluence',
			notePathName: 'Note path',
			notePathDesc: 'Path relative to vault root; .md is appended automatically',
			urlName: 'Confluence page URL',
			urlDesc: 'Supports both /pages/{id}/ and ?pageId={id} URL forms',
			cancel: 'Cancel',
			create: 'Create',
		},
		confirm: {
			cancel: 'Cancel',
			defaultOk: 'OK',
		},
	},

	// ===== Note template body =====
	template: {
		title: '# Title',
		usage:
			'> Pick one of two publishing flows:\n> 1. Existing Confluence page → put the page URL in `confluence_url`.\n> 2. New child page → put the parent page URL in `confluence_parent_url`. On first publish, the plugin creates a child page named after this note, then writes the new URL back to `confluence_url`.\n> The other fields (`confluence_page_id`, `confluence_last_published_at`, `confluence_content_hash`) are maintained automatically.\n> Optional: set `confluence_title` to override the Confluence page title.\n>\n> Optional Confluence-only source markers:\n> - `<!-- confluence:ignore-start --> ... <!-- confluence:ignore-end -->` removes Obsidian-only content from published pages.',
		bodyHeading: '## Body',
		bodyPlaceholder: 'Write here…',
		publishingPlaceholder: '<p>(publishing…)</p>',
	},
};

export type Messages = typeof en;
