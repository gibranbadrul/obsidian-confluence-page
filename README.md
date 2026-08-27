<div align="center">
<p>
  <img src='assets/obsidian-confluence-page-banner.png'>
  <a href="https://github.com/gibranbadrul/obsidian-confluence-page">Confluence Page Publisher</a>
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
* [Image attributes](#image-attributes)
    * [Editor toolbar](#editor-toolbar)
* [Callouts](#callouts)
    * [Collapsible callouts](#collapsible-callouts)
    * [`<details>` blocks](#details-blocks)
* [Attachment publishing](#attachment-publishing)
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
    * [Available targets](#available-targets)
    * [Build](#build)
    * [Development build](#development-build)
    * [Quality checks](#quality-checks)
    * [Deploy to a local vault](#deploy-to-a-local-vault)
    * [Uninstall from a local vault](#uninstall-from-a-local-vault)
    * [Release](#release)
* [License](#license)

</details>

---

Obsidian plugin that publishes your notes to Confluence as Confluence Storage XHTML, with frontmatter page binding, attachment uploads, diagram rendering, automatic bound-note links, and content-hash based skips.

## Install

### From Obsidian

When the plugin is listed in the Obsidian community plugin browser:

Settings > Community plugins > Browse > Search `Confluence Page Publisher` > Install > Enable

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/gibranbadrul/obsidian-confluence-page/releases/latest)
2. Create folder:

   ```text
   /path/to/your-vault/.obsidian/plugins/confluence-page-publisher/
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

After a successful publishing, the note frontmatter will look like this:

```yaml
---
confluence_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/123456/My+Page"
confluence_page_id: "123456"
confluence_last_published_at: "2026-07-07T10:30:00.000Z"
confluence_content_hash: "d3f91cb44f6c8a6d72c640adbc18e870f1aa0031"
confluence_attachments:
  "123456":
    image.png:
      hash: "38ab93050f81a0c93d8166150ed8540a47f2748d"
      id: "att987654"
---
```

### Create a new child page

Use `confluence_parent_url` when the note should create a new page under an existing Confluence container.

Parent page example:

```yaml
---
confluence_url:
confluence_parent_url: "https://example.atlassian.net/wiki/spaces/DOC/pages/100/Parent+Page"
confluence_title: "New Child Page"
---
```

On Confluence Cloud, the parent may also be a folder URL:

```yaml
---
confluence_url:
confluence_parent_url: "https://example.atlassian.net/wiki/spaces/DOC/folder/200/Documentation"
confluence_title: "New Folder Page"
---
```

For a parent page, the plugin creates the new page directly beneath that page. For a Cloud folder, it creates the page in the folder's space and then moves it into the folder.

Folder parent URLs are supported only when **Confluence type** is set to **Cloud**. Confluence Server / Data Center requires a parent page URL.

After the first successful creation, the plugin writes the resolved page URL and ID into the note. Future publishes update that same page directly.

### Trigger publishing

| Method                                        | Behavior                                                           |
|-----------------------------------------------|--------------------------------------------------------------------|
| **Command Palette** > Publish current note    | Publishes the active note                                          |
| **Command Palette** > Publish all bound notes | Publishes every note with Confluence frontmatter                   |
| **Ribbon icon**                               | Publishes all bound notes                                          |
| **Editor right-click**                        | Opens a Confluence submenu for publishing and ignore helpers       |
| **File tree right-click on note**             | Publishes a bound note or inserts frontmatter into an unbound note |
| **File tree right-click on folder**           | Publishes bound notes under that folder recursively                |

### Helper commands

| Command                                         | Behavior                                                        |
|-------------------------------------------------|-----------------------------------------------------------------|
| Insert Confluence frontmatter into current note | Adds the publisher frontmatter fields                           |
| Create bound note                               | Creates a note already bound to a Confluence page URL           |
| Add ignore line macro                           | Marks the current line or selected lines as excluded            |
| Add ignore block macro                          | Wraps the selection in a block excluded from Confluence output  |
| Add table of contents macro                     | Inserts a marker that renders as a Confluence table of contents |
| Export storage preview of current note          | Writes `example.preview.xml` with generated Storage XHTML       |
| Validate credentials                            | Checks the current Confluence connection                        |

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

| Field                          | Description                                                                        |
|--------------------------------|------------------------------------------------------------------------------------|
| `confluence_url`               | Target Confluence page URL                                                         |
| `confluence_parent_url`        | Parent page URL, or Confluence Cloud folder URL, used for first-time page creation |
| `confluence_title`             | Optional Confluence page title override                                            |
| `confluence_page_id`           | Resolved Confluence page ID                                                        |
| `confluence_last_published_at` | Last successful publish timestamp                                                  |
| `confluence_content_hash`      | Content hash used to skip unchanged notes                                          |
| `confluence_attachments`       | Per-page attachment cache used to skip unchanged uploads                           |

The attachment cache is grouped by Confluence page ID so attachment metadata is not reused accidentally when the note is rebound to another page. Existing flat attachment metadata is migrated when a target page ID is available.

Creating a root page directly from a space key is planned. New pages currently require an existing parent page, or a folder when using Confluence Cloud.

## What gets converted

| Element                                     | Output                                                                 |
|---------------------------------------------|------------------------------------------------------------------------|
| YAML frontmatter                            | Removed from the published body                                        |
| Headings H1-H6                              | Confluence headings                                                    |
| Paragraphs                                  | Confluence paragraphs                                                  |
| Bold, italic, bold italic                   | Rich text formatting                                                   |
| Strikethrough                               | Rich text formatting                                                   |
| Inline code                                 | Inline code                                                            |
| Standard links                              | Confluence links                                                       |
| Plain URLs                                  | Linkified URLs                                                         |
| Ordered lists                               | Ordered lists                                                          |
| Unordered lists                             | Bullet lists                                                           |
| Nested lists                                | Nested lists                                                           |
| Blockquotes                                 | Blockquotes                                                            |
| Tables                                      | Tables                                                                 |
| Horizontal rules                            | Horizontal rules                                                       |
| Fenced code blocks                          | Confluence code macros                                                 |
| Code block language                         | Preserved when available                                               |
| Indented code blocks                        | Confluence code macros                                                 |
| Obsidian wikilinks                          | Confluence link when the target note is bound; readable text otherwise |
| Obsidian wikilink aliases                   | Same resolution with the alias used as link text                       |
| Obsidian callouts                           | See [Callouts](#callouts) for details                                  |
| Local Markdown images                       | Confluence attachments                                                 |
| Obsidian image embeds                       | Confluence attachments                                                 |
| Remote images                               | Remote image URLs                                                      |
| Image alt text                              | Preserved when available                                               |
| Image size / align / border modifiers       | See [Image attributes](#image-attributes) for details                  |
| Mermaid blocks                              | Rendered image attachment when enabled                                 |
| PlantUML blocks                             | Rendered image attachment when enabled                                 |
| Internal Macros                             | See [Internal macros](#internal-macros) for details                    |

## Not converted yet

| Element                 | Current behavior                                                                       |
|-------------------------|----------------------------------------------------------------------------------------|
| Highlight               | Kept as plain text                                                                     |
| Task lists              | Kept as text markers                                                                   |
| Heading/block wikilinks | Resolve the target page when bound, but do not preserve the heading or block anchor    |
| Non-image file embeds   | Uploaded, but richer attachment rendering is planned                                   |
| Footnotes               | Kept as plain text                                                                     |
| Math / LaTeX            | Kept as plain text                                                                     |
| Tags                    | Kept as text; Confluence labels are planned                                            |
| Note transclusion       | Not inlined yet                                                                        |
| Raw HTML                | Escaped / not executed, except `<details>` — see [`<details>` blocks](#details-blocks) |
| Definition lists        | Kept as regular text                                                                   |
| Supplementary emoji     | Replaced with stable placeholders for Confluence compatibility                         |

## Internal macros

Confluence Page Publisher supports a few internal comment macros. These macros are only used by the plugin before publishing. They are not sent to Confluence.

| Scope       | Behavior                                                                       | UI helper                                |
|-------------|--------------------------------------------------------------------------------|------------------------------------------|
| Single line | Removes the whole line from the published output                               | Yes, via `Add ignore line macro`         |
| Block       | Removes everything between the start and end markers from the published output | Yes, via `Add ignore block macro`        |
| TOC         | Inserts a Confluence table of contents macro                                   | Yes, via `Add table of contents macro`   |

## Image attributes

Add `cpp-`-prefixed modifiers after a `|` to resize, align, wrap, border, or caption an image — works on  Obsidian embeds (`![[image.png|...]]`)
and Markdown images (`![...](image.png)`), stack as many as you want in any order.  The `cpp-` prefix keeps them from clashing with other
plugins that read the same `|` segment (some use bare numbers for resizing),  and from accidentally matching real alt text.

### Editor toolbar

Click an image alone on its own line (e.g. `![[image.png]]`) in the editor and a toolbar shows up below it — no need to type the syntax by hand.
Align, wrap, and border toggle are buttons; **Color** / **Size** open a dropdown for border thickness/color; **Image Size** and
**Alt text & Caption** open a small panel (Apply/Enter to commit, Cancel/Escape to discard). Move the cursor off the line and it disappears.
Toggle it off in Settings → Interface → **Show image attributes toolbar**.

```text
![[diagram.png|A caption describing the diagram|cpp-w-300|cpp-h-200|cpp-border-bold|cpp-center]]
```

| Modifier          | Example                                                                            | Result                                                                    |
|-------------------|------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| Width             | `\|cpp-w-300`                                                                      | `ac:width="300"`                                                          |
| Height            | `\|cpp-h-200`                                                                      | `ac:height="200"`                                                         |
| Width and height  | `\|cpp-w-300\|cpp-h-200`                                                           | `ac:width="300" ac:height="200"`                                          |
| Alignment         | `\|cpp-left`, `\|cpp-center`, `\|cpp-right`                                        | `ac:align="..."`                                                          |
| Wrap              | `\|cpp-left\|cpp-wrap`, `\|cpp-right\|cpp-wrap`                                    | `ac:align="..."` + `ac:layout="wrap-left"`/`"wrap-right"`                 |
| Border            | `\|cpp-border`                                                                     | `ac:border="true"`                                                        |
| Border thickness  | `\|cpp-border-subtle`, `\|cpp-border-medium`, `\|cpp-border-bold`                  | `ac:border="true"` + Confluence Cloud border thickness (see caveat below) |
| Border color      | `\|cpp-border-color-light`, `\|cpp-border-color-medium`, `\|cpp-border-color-dark` | `ac:border="true"` + Confluence Cloud border color (see caveat below)     |
| Caption           | `\|cpp-caption:A visible caption`                                                  | `<ac:caption>` child element (see caveat below)                           |
| Combined          | `\|cpp-w-300\|cpp-h-200\|cpp-border-bold\|cpp-right`                               | all of the above together                                                 |

## Callouts

Obsidian callouts (`> [!type] Title`) become Confluence structured macros. Most types map to the similarly-named panel:

| Callout type(s)                      | Confluence panel   |
|--------------------------------------|--------------------|
| `note`, `info`, `tip`, `hint`        | Info               |
| `warning`, `caution`, `attention`    | Warning            |
| `danger`, `error`, `failure`, `bug`  | Note               |
| `success`, `check`, `done`           | Tip                |
| anything else                        | Info (default)     |

### Collapsible callouts

Fold any callout with Obsidian's own `-`/`+` marker and it becomes a collapsible expand section instead of a panel, regardless of type — Confluence's colored panels have no collapse option, only its expand macro does, so foldability always wins:

```text
> [!note]- Click to expand
> Hidden details — lists, code blocks, anything goes.
```

```xml
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Click to expand</ac:parameter>
  <ac:rich-text-body>Hidden details — lists, code blocks, anything goes.</ac:rich-text-body>
</ac:structured-macro>
```

The type still picks the icon/color when a callout isn't folded; fold it and that's traded away for a plain expand toggle instead. This isn't limited to a specific type — `[!warning]-`, `[!tip]+`, even an unrecognized type like `[!quote]-`, all produce the same expand section. The title line (`Click to expand`) becomes a real `ac:parameter`, same as `<details><summary>` below, so it stays visible on the toggle while the section is collapsed.

### `<details>` blocks

`<details><summary>Title</summary>...</details>` also becomes an expand macro — each tag alone on its own line, `<summary>` optional:

```text
<details>
<summary>Click to expand</summary>

Hidden text, lists, or code blocks go here.

</details>
```

```xml
<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Click to expand</ac:parameter>
  <ac:rich-text-body>Hidden text, lists, or code blocks go here.</ac:rich-text-body>
</ac:structured-macro>
```

Same title behavior as a folded callout above — the body is parsed as ordinary Markdown, not treated as opaque HTML.

This is the one deliberate exception to "raw HTML is escaped, not executed" (see [What gets converted](#what-gets-converted)) — `<details>` specifically is recognized and converted, nothing else is. It works for publishing regardless of how the note looks in Obsidian itself: Obsidian's own renderer doesn't parse Markdown inside raw HTML blocks by default, so a note with unrendered lists/code inside a `<details>` fold is a known Obsidian limitation, not something this plugin can fix. Install a community plugin such as [Details Markdown](https://obsidian.md/plugins?id=details-markdown) if you also want that content to render properly while reading the note in Obsidian — either way, publishing to Confluence produces the same expand macro.

## Attachment publishing

When local attachment uploads are enabled, the publisher:

1. Resolves local Markdown images and Obsidian embeds from the vault
2. Calculates a content hash for each attachment
3. Reuses unchanged attachment metadata from `confluence_attachments`
4. Updates changed attachments using the cached attachment ID when possible
5. Falls back to filename lookup and Confluence's create-or-update endpoint when the direct update fails

Common image formats, including SVG (`image/svg+xml`), are supported. The fallback update flow is useful for Confluence instances that reject a direct attachment-data update for some file types.

Attachment filenames must be unique within a published page because Confluence addresses page attachments by filename.

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
| Publishing assets   | Attachment upload toggle and max file size             |
| Content conversion  | Mermaid and PlantUML rendering options                 |
| Interface           | Status bar, notices, and the image attributes toolbar  |

## Authentication

Changes to the base URL, Confluence type, authentication type, account, or selected key-vault secret are applied to the publisher connection without requiring an Obsidian restart. Use **Validate credentials** after changing connection settings.

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
- New page creation requires an existing parent page URL, or a folder URL on Confluence Cloud
- Root page creation from `confluence_space_key` is planned
- Task lists, footnotes, math, tags-to-labels, and note transclusion are planned
- Raw HTML is not executed, except `<details>` (see [`<details>` blocks](#details-blocks))
- Mobile Obsidian is not supported

## Development

### Prerequisites

- Bun
- Git-cliff

### Setup

```bash
git clone https://github.com/gibranbadrul/obsidian-confluence-page.git
cd obsidian-confluence-page
bun install
```

### Available targets

Run:

```bash
make help
```

The main targets are:

| Target                     | Behavior                                              |
|----------------------------|-------------------------------------------------------|
| `make dev`                 | Starts the development build watcher                  |
| `make lint`                | Runs ESLint                                           |
| `make test`                | Runs the unit test suite                              |
| `make check`               | Runs lint, tests, and the production build            |
| `make build`               | Builds and validates the plugin files in `dist/`      |
| `make install`             | Builds and installs the plugin into a local vault     |
| `make uninstall`           | Removes the plugin from the configured local vault    |
| `make clean`               | Removes generated build artifacts                     |

### Build

```bash
make build
```

The build must produce:

```text
dist/main.js
dist/manifest.json
dist/styles.css
```

### Development build

```bash
make dev
```

### Quality checks

Run the complete local validation workflow:

```bash
make check
```

Individual checks are also available:

```bash
make lint
make test
```

### Deploy to a local vault

Configure either the vault root:

```bash
make install OBSIDIAN_VAULT="/path/to/vault"
```

or the complete plugin directory:

```bash
make install \
  OBSIDIAN_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/confluence-page-publisher"
```

The target builds the plugin and copies `main.js`, `manifest.json`, and `styles.css` into the destination. Restart Obsidian or reload the plugin after installation.

### Uninstall from a local vault

Use the same destination variable used during installation:

```bash
make uninstall OBSIDIAN_VAULT="/path/to/vault"
```

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