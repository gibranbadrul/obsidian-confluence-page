<div align="center">
<p>
  <img src='assets/obsidian-confluence-page-banner.png'>
  <a href="#">Obsidian Confluence Page</a>
</p>

<p>
  <a href="https://github.com/gibranbadrul/obsidian-confluence-page/releases/latest"><img src="https://img.shields.io/github/v/release/gibranbadrul/obsidian-confluence-page?label=release&color=%237C3AED" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-desktop-blue" alt="Desktop">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <a href="https://github.com/gibranbadrul/obsidian-confluence-page/issues"><img src="https://img.shields.io/github/issues/gibranbadrul/obsidian-confluence-page?color=%23f59e0b" alt="Issues"></a>
</p>

<p><em>A one-way publisher for turning Obsidian notes into Confluence pages.</em></p>
</div>

---

<!-- markdownlint-disable -->
<details>
<summary>📖 Table of Contents</summary>

* [Install](#install)
    * [From Obsidian](#from-obsidian)
    * [Manual](#manual)
    * [BRAT](#brat)
* [Usage](#usage)
    * [Create a new child page](#create-a-new-child-page)
    * [Trigger publishing](#trigger-publishing)
    * [Helper commands](#helper-commands)
* [Frontmatter](#frontmatter)
    * [Existing page](#existing-page)
    * [New child page](#new-child-page)
    * [Full template](#full-template)
* [What gets converted](#what-gets-converted)
* [Not converted yet](#not-converted-yet)
* [Internal macros](#internal-macros)
* [Diagram rendering](#diagram-rendering)
* [Settings](#settings)
* [Authentication](#authentication)
    * [Atlassian Cloud](#atlassian-cloud)
    * [Confluence Server / Data Center with PAT](#confluence-server--data-center-with-pat)
    * [Legacy Server account](#legacy-server-account)
* [Storage preview](#storage-preview)
* [Privacy & network behavior](#privacy--network-behavior)
* [Limitations](#limitations)
* [Development](#development)
    * [Prerequisites](#prerequisites)
    * [Setup](#setup)
    * [Build](#build)
    * [Development build](#development-build)
    * [Deploy to a local vault](#deploy-to-a-local-vault)
    * [Release](#release)
* [License](#license)

</details>
<!-- markdownlint-restore -->

---

Obsidian plugin that publishes your notes to Confluence as Confluence Storage XHTML, with frontmatter page binding, attachment uploads, diagram rendering, and content-hash based skips.

## Install

### From Obsidian

When the plugin is listed in the Obsidian community plugin browser:

Settings > Community plugins > Browse > Search `Confluence Page Publisher` > Install > Enable

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/gibranbadrul/obsidian-confluence-page/releases/latest)
2. Create folder:

   ```text
   <vault>/.obsidian/plugins/confluence-page-publisher/
   ```

3. Copy the 3 files into that folder
4. Restart Obsidian
5. Settings > Community plugins > Enable "Confluence Page Publisher"

### BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat)
2. Open BRAT settings
3. Add beta plugin:

   ```text
   gibranbadrul/obsidian-confluence-page
   ```

4. Enable "Confluence Page Publisher"

## Usage

Bind a note to a Confluence page with frontmatter:

```yaml
---
confluence_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/123456/My+Page"
---
```

Then publish it:

```text
Command Palette > Publish current note
```

The plugin converts the note to Confluence Storage XHTML, uploads local attachments, updates the Confluence page, and writes publish metadata back to the note.

After a successful publish, the note frontmatter will look like this:

```yaml
---
confluence_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/123456/My+Page"
confluence_page_id: "123456"
confluence_last_published_at: "2026-07-07T10:30:00.000Z"
confluence_content_hash: "..."
confluence_attachments:
  image.png:
    hash: "..."
    id: "..."
---
```

### Create a new child page

Use `confluence_parent_url` when the note should create a new child page under an existing Confluence page:

```yaml
---
confluence_url:
confluence_parent_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/100/Parent+Page"
confluence_title: "New Child Page"
---
```

On first publish, the plugin creates the child page and writes the resolved page URL back into `confluence_url`.

After that, future publishes update the same page directly.

### Trigger publishing

| Method                                        | Behavior                                            |
|-----------------------------------------------|-----------------------------------------------------|
| **Command Palette** > Publish current note    | Publishes the active note                           |
| **Command Palette** > Publish all bound notes | Publishes every note with Confluence frontmatter    |
| **Ribbon icon**                               | Publishes all bound notes                           |
| **Editor right-click**                        | Publishes the current note or inserts frontmatter   |
| **File tree right-click on note**             | Publishes that note or inserts frontmatter          |
| **File tree right-click on folder**           | Publishes bound notes under that folder recursively |

### Helper commands

| Command                                         | Behavior                                                     |
|-------------------------------------------------|--------------------------------------------------------------|
| Insert Confluence frontmatter into current note | Adds the publisher frontmatter fields                        |
| Create bound note                               | Creates a note already bound to a Confluence page URL        |
| Add ignore block macro                          | Inserts a block that is removed from Confluence output       |
| Export storage preview of current note          | Writes `example.preview.xml` with generated Storage XHTML    |
| Validate credentials                            | Checks the current Confluence connection                     |

## Frontmatter

### Existing page

```yaml
---
confluence_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/123456/My+Page"
---
```

### New child page

```yaml
---
confluence_url:
confluence_parent_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/100/Parent+Page"
---
```

### Full template

```yaml
---
confluence_url:
confluence_parent_url:
confluence_title:
confluence_page_id:
confluence_last_published_at:
confluence_content_hash:
---
```

| Field                          | Description                                                |
|--------------------------------|------------------------------------------------------------|
| `confluence_url`               | Target Confluence page URL                                 |
| `confluence_parent_url`        | Parent page URL used to create a child page                |
| `confluence_title`             | Optional Confluence page title override                    |
| `confluence_page_id`           | Resolved Confluence page ID                                |
| `confluence_last_published_at` | Last successful publish timestamp                          |
| `confluence_content_hash`      | Content hash used to skip unchanged notes                  |
| `confluence_attachments`       | Attachment cache used to skip unchanged attachment uploads |

Creating a root page directly from a space key is planned, but the current version creates new pages under an existing parent page.

## What gets converted

| Element                                     | Output                                 |
|---------------------------------------------|----------------------------------------|
| YAML frontmatter                            | Removed from the published body        |
| Headings H1-H6                              | Confluence headings                    |
| Paragraphs                                  | Confluence paragraphs                  |
| Bold, italic, bold italic                   | Rich text formatting                   |
| Strikethrough                               | Rich text formatting                   |
| Inline code                                 | Inline code                            |
| Standard links                              | Confluence links                       |
| Plain URLs                                  | Linkified URLs                         |
| Ordered lists                               | Ordered lists                          |
| Unordered lists                             | Bullet lists                           |
| Nested lists                                | Nested lists                           |
| Blockquotes                                 | Blockquotes                            |
| Tables                                      | Tables                                 |
| Horizontal rules                            | Horizontal rules                       |
| Fenced code blocks                          | Confluence code macros                 |
| Code block language                         | Preserved when available               |
| Indented code blocks                        | Confluence code macros                 |
| Obsidian wikilinks `[[Note]]`               | Readable text                          |
| Obsidian wikilink aliases `[[Note\|Alias]]` | Alias text                             |
| Obsidian callouts `> [!note]`               | Confluence structured macros           |
| Local Markdown images                       | Confluence attachments                 |
| Obsidian image embeds                       | Confluence attachments                 |
| Remote images                               | Remote image URLs                      |
| Image alt text                              | Preserved when available               |
| Mermaid blocks                              | Rendered image attachment when enabled |
| PlantUML blocks                             | Rendered image attachment when enabled |

## Not converted yet

| Element                             | Current behavior                                               |
|-------------------------------------|----------------------------------------------------------------|
| Highlight `==text==`                | Kept as plain text                                             |
| Task lists `- [ ]` / `- [x]`        | Kept as text markers                                           |
| Heading/block wikilinks             | Converted to readable text, not resolved                       |
| Non-image file embeds               | Uploaded, but richer attachment rendering is planned           |
| Footnotes                           | Kept as plain text                                             |
| Math / LaTeX                        | Kept as plain text                                             |
| Tags                                | Kept as text; Confluence labels are planned                    |
| Note transclusion `![[Other Note]]` | Not inlined yet                                                |
| Raw HTML                            | Escaped / not executed                                         |
| Definition lists                    | Kept as regular text                                           |
| Supplementary emoji                 | Replaced with stable placeholders for Confluence compatibility |

## Internal macros

Confluence Page Publisher supports a few internal comment macros. These macros are only used by the plugin before publishing. They are not sent to Confluence.

| Macro                                                                 | Scope       | Behavior                                                                       | UI helper                         |
|-----------------------------------------------------------------------|-------------|--------------------------------------------------------------------------------|-----------------------------------|
| `<!-- confluence:ignore-line -->`                                     | Single line | Removes the whole line from the published output                               | Not yet                           |
| `<!-- confluence:ignore-start -->` + `<!-- confluence:ignore-end -->` | Block       | Removes everything between the start and end markers from the published output | Yes, via `Add ignore block macro` |

Example ignore line:

```md
<!-- confluence:ignore-line --> This line will not be published.
```

Example ignore block:

```md
<!-- confluence:ignore-start -->

This whole block will not be published.

- Hidden bullet
- Hidden text
- Hidden [[wikilink]]

<!-- confluence:ignore-end -->
```

## Diagram rendering

Mermaid and PlantUML rendering is optional.

| Source   | Behavior                                                                               |
|----------|----------------------------------------------------------------------------------------|
| Mermaid  | Sends the diagram source to a Kroki-compatible endpoint and uploads the rendered image |
| PlantUML | Sends the diagram source to a PlantUML server and uploads the rendered image           |

Default render services:

| Setting                    | Default                             |
|----------------------------|-------------------------------------|
| Mermaid render service URL | `https://kroki.io/mermaid/png`      |
| PlantUML server URL        | `https://www.plantuml.com/plantuml` |

For private documentation, use a self-hosted Kroki or PlantUML service.

## Settings

Settings > Community plugins > Confluence Page Publisher > Settings

| Setting area        | Description                                            |
|---------------------|--------------------------------------------------------|
| Connection profile  | Base URL, auth type, account, token secret             |
| Page defaults       | Template folder, title property, auto-install template |
| Publishing scope    | Scan folders and ignore patterns                       |
| Publishing metadata | Frontmatter field mapping                              |
| Attachments         | Upload toggle and max file size                        |
| Diagram rendering   | Mermaid and PlantUML rendering options                 |
| Interface           | Status bar and notices                                 |

## Authentication

### Atlassian Cloud

Use Basic auth:

```text
Account: your Atlassian email
Password / API token: Atlassian API token
```

Base URL usually looks like this:

```text
https://example.atlassian.net/wiki
```

### Confluence Server / Data Center with PAT

Use Bearer auth:

```text
Password / API token: Personal Access Token
```

Base URL usually looks like this:

```text
https://confluence.your-company.com
```

### Legacy Server account

Use Basic auth:

```text
Account: your username
Password / API token: your account password
```

## Storage preview

Use this command to inspect the generated Confluence Storage XHTML before publishing:

```text
Command Palette > Export storage preview of current note
```

It writes:

```text
example.preview.xml
```

Use this when:

- A page does not render as expected in Confluence
- An attachment does not appear
- A callout or code block looks wrong
- Mermaid or PlantUML falls back to source text
- You want to debug the converter without updating Confluence

## Privacy & network behavior

Confluence Page Publisher is a local Obsidian desktop plugin.

Here is what it does:

- **Reads selected notes from your vault.**
  Only notes you publish, or notes inside a folder/all-bound publish operation, are processed.
- **Reads referenced local attachments.**
  Local images and embeds are read so they can be uploaded to Confluence.
- **Sends content to your configured Confluence URL.**
  Page content, page metadata, and attachments are sent to Confluence when you publish.
- **Uses your configured authentication method.**
  Credentials are used only for Confluence API requests.
- **Uses Obsidian key vault when available.**
  Tokens should be stored as Obsidian secrets instead of plain text.
- **May contact diagram render services.**
  Mermaid and PlantUML source is sent to the configured render service only when diagram rendering is enabled.
- **Does not read your clipboard.**
  Publishing does not depend on clipboard access.
- **Does not sync Confluence back into Obsidian.**
  The flow is one-way: Obsidian to Confluence.
- **Enumerates vault file paths when needed.**
  The plugin scans Markdown files to find notes with Confluence publishing frontmatter for publish-all and folder publishing. It may also enumerate files as a fallback when resolving local attachment links by filename.

## Limitations

- One-way publishing only
- Confluence edits are not pulled back into Obsidian
- New page creation currently requires an existing parent page URL
- Root page creation from `confluence_space_key` is planned
- Task lists, footnotes, math, tags-to-labels, note transclusion, and semantic image captions are planned
- Raw HTML is not executed
- Mobile Obsidian is not supported

## Development

### Prerequisites

- Bun
- Git-cliff

### Setup

```bash
git clone https://github.com/gibranbadrul/obsidian-confluence-page.git
cd confluence-page
bun install
```

### Build

```bash
bun run build
```

### Development build

```bash
bun run dev
```

### Deploy to a local vault

```bash
bun run build
mkdir -p "<vault>/.obsidian/plugins/confluence-page-publisher"
cp dist/main.js dist/manifest.json dist/styles.css "<vault>/.obsidian/plugins/confluence-page-publisher/"
```

Restart Obsidian or reload the plugin.

### Release

Use the release script with flags:

```bash
./scripts/release.sh --major
./scripts/release.sh --minor
./scripts/release.sh --patch
./scripts/release.sh --auto
./scripts/release.sh --version <semver>
```

Release candidate:

```bash
./scripts/release.sh --minor --rc
```

Example to push release commit and tag:

```bash
./scripts/release.sh --version <SEMVER> --push
```

The release workflow builds and attaches the required plugin files:

```text
main.js
manifest.json
styles.css
```

## License

[MIT Zero Clause](./LICENSE)