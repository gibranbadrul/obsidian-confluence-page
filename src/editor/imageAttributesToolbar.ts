import { addIcon, type App, Menu, setIcon, setTooltip } from 'obsidian';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import {
	type ImageAlign,
	type ImageAttributes,
	type ImageBorderColor,
	type ImageBorderSize,
	parseImageAttributes,
	stringifyImageAttributes,
} from '../confluence/storageXhtml';
import { findImageEmbedsOnLine, isStandaloneImageEmbed, type ImageEmbedMatch } from './imageEmbedLocator';
import { AnchoredPanel } from './anchoredPanel';
import { t } from '../i18n';

type ImageAttributesPatch = Partial<Pick<ImageAttributes, 'alt' | 'caption' | 'width' | 'height' | 'align' | 'wrap' | 'border' | 'borderSize' | 'borderColor'>>;

const SIZE_PRESETS: ReadonlyArray<{ labelKey: string; width?: string }> = [
	{ labelKey: 'sizeOriginal', width: undefined },
	{ labelKey: 'sizeSmall', width: '300' },
	{ labelKey: 'sizeMedium', width: '500' },
	{ labelKey: 'sizeLarge', width: '800' },
];

/** Shared stroke style for the two hand-drawn icons below (Size, Wrap) — no icon-library glyph exists for
 * either concept. Obsidian's `addIcon` wraps bare shape markup in an implicit `<svg viewBox="0 0 100 100">`. */
const ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"';

const ALIGN_BUTTONS: ReadonlyArray<{ align: ImageAlign; icon: string; labelKey: string }> = [
	{ align: 'left', icon: 'text-align-start', labelKey: 'alignLeft' },
	{ align: 'center', icon: 'text-align-center', labelKey: 'alignCenter' },
	{ align: 'right', icon: 'text-align-end', labelKey: 'alignRight' },
];

/** A square with two corner resize handles. */
addIcon(
	'confluence-image-dimensions',
	`<g ${ICON_STROKE}>` +
		'<rect width="75" height="75" x="12.5" y="12.5" rx="8"/>' +
		'<path d="M50 29.17H29.17v20.83"/>' +
		'<path d="M50 70.83h20.83v-20.83"/>' +
		'</g>',
);

/** The standard "float" glyph: a full-width line, an image box beside three text lines, another
 * full-width line — reading as a paragraph with the image tucked into one corner. */
function wrapIcon(imageOnLeft: boolean): string {
	const boxX = imageOnLeft ? 12 : 54;
	const [linesX1, linesX2] = imageOnLeft ? [62, 88] : [12, 38];
	const textLines = [31, 50, 69].map((y) => `<line x1="${linesX1}" y1="${y}" x2="${linesX2}" y2="${y}"/>`).join('');
	return (
		`<g ${ICON_STROKE}>` +
		'<line x1="12" y1="13" x2="88" y2="13"/>' +
		`<rect width="34" height="38" x="${boxX}" y="31" rx="8"/>` +
		textLines +
		'<line x1="12" y1="87" x2="88" y2="87"/>' +
		'</g>'
	);
}
addIcon('confluence-wrap-left', wrapIcon(true));
addIcon('confluence-wrap-right', wrapIcon(false));

/** Wraps surrounding text around a left/right-aligned image instead of the image sitting on its own line
 * — a distinct Confluence layout (`ac:layout="wrap-left"`/`"wrap-right"`, see storageXhtml.ts), not just
 * plain alignment, so these get their own buttons rather than folding into ALIGN_BUTTONS. No center variant:
 * there's no "wrap-center" in Confluence. */
const WRAP_BUTTONS: ReadonlyArray<{ align: 'left' | 'right'; icon: string; labelKey: string }> = [
	{ align: 'left', icon: 'confluence-wrap-left', labelKey: 'wrapLeft' },
	{ align: 'right', icon: 'confluence-wrap-right', labelKey: 'wrapRight' },
];

/** Border thickness options, listed smallest to largest in the native "Size" dropdown menu. "Plain"
 * (border with no explicit size/color) isn't listed here — it's just the main toggle button's default
 * state, so it doesn't need its own entry. */
const BORDER_SIZE_OPTIONS: ReadonlyArray<{ labelKey: string; borderSize: ImageBorderSize }> = [
	{ labelKey: 'borderSubtle', borderSize: 'subtle' },
	{ labelKey: 'borderMedium', borderSize: 'medium' },
	{ labelKey: 'borderBold', borderSize: 'bold' },
];

/** Border color presets, light to dark, listed in the native "Color" dropdown menu. */
const BORDER_COLOR_OPTIONS: ReadonlyArray<{ labelKey: string; borderColor: ImageBorderColor }> = [
	{ labelKey: 'borderColorLight', borderColor: 'light' },
	{ labelKey: 'borderColorMedium', borderColor: 'medium' },
	{ labelKey: 'borderColorDark', borderColor: 'dark' },
];

/** Icon-only button with an Obsidian-native hover tooltip. */
function makeIconButton(icon: string, title: string, onClick: (evt: MouseEvent) => void, active = false): HTMLButtonElement {
	return createEl('button', { cls: 'confluence-image-toolbar-icon-button', attr: { type: 'button' } }, (btn) => {
		setTooltip(btn, title);
		if (active) btn.addClass('is-active');
		setIcon(btn, icon);
		btn.addEventListener('mousedown', (evt) => evt.preventDefault());
		btn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			evt.preventDefault();
			onClick(evt);
		});
	});
}

/** A size-preset pill. */
function makeChoiceButton(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
	return createEl('button', { cls: 'confluence-image-size-choice', text: label, attr: { type: 'button' } }, (btn) => {
		if (active) btn.addClass('is-active');
		btn.addEventListener('mousedown', (evt) => evt.preventDefault());
		btn.addEventListener('click', onClick);
	});
}

/** Text + chevron trigger button that opens a native `obsidian.Menu` (see showBorderColorMenu /
 * showBorderSizeMenu) — renders through Obsidian's own layer instead of the editor's DOM, so it's never
 * clipped by CodeMirror's content container. */
function makeMenuTriggerButton(label: string, active: boolean, onClick: (evt: MouseEvent) => void): HTMLButtonElement {
	return createEl('button', { cls: 'confluence-image-toolbar-button confluence-image-toolbar-menu-trigger', attr: { type: 'button' } }, (btn) => {
		if (active) btn.addClass('is-active');
		btn.createSpan({ text: label });
		btn.createSpan({ cls: 'confluence-image-toolbar-menu-trigger-chevron' }, (el) => setIcon(el, 'chevron-down'));
		btn.addEventListener('mousedown', (evt) => evt.preventDefault());
		btn.addEventListener('click', (evt) => {
			evt.stopPropagation();
			evt.preventDefault();
			onClick(evt);
		});
	});
}

/** A title plus Reset (undo) / Cancel (x) / Apply (check) icon buttons. Panels commit only through this
 * row or Enter in a field, never on blur — blurring a field the moment CodeMirror tears the panel down
 * to rebuild it re-enters `view.dispatch` while the previous one is still in progress. */
function buildPanelHeader(title: string, onReset: () => void, onCancel: () => void, onApply: () => void): HTMLElement {
	const header = createDiv({ cls: 'confluence-image-panel-header' });
	header.createSpan({ cls: 'confluence-image-panel-header-title', text: title });
	const actions = header.createDiv({ cls: 'confluence-image-panel-header-actions' });
	const cancelBtn = makeIconButton('x', t('imageToolbar.cancel'), onCancel);
	cancelBtn.addClass('confluence-image-panel-header-cancel');
	const applyBtn = makeIconButton('check', t('imageToolbar.apply'), onApply);
	applyBtn.addClass('confluence-image-panel-header-apply');
	actions.appendChild(makeIconButton('undo-2', t('imageToolbar.reset'), onReset));
	actions.appendChild(cancelBtn);
	actions.appendChild(applyBtn);
	return header;
}

/** Opens a native Obsidian dropdown menu listing the border color presets, with a checkmark on the
 * currently active one, anchored below `anchor`. */
function showBorderColorMenu(current: ImageAttributes, anchor: HTMLElement, onApply: (patch: ImageAttributesPatch) => void): void {
	const menu = new Menu();
	for (const option of BORDER_COLOR_OPTIONS) {
		menu.addItem((item) => {
			item.setTitle(t(`imageToolbar.${option.labelKey}`));
			item.setChecked(current.border === true && current.borderColor === option.borderColor);
			item.onClick(() => onApply({ border: true, borderColor: option.borderColor }));
		});
	}
	const rect = anchor.getBoundingClientRect();
	menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
}

/** Opens a native Obsidian dropdown menu listing the border thickness presets, with a checkmark on the
 * currently active one, anchored below `anchor`. */
function showBorderSizeMenu(current: ImageAttributes, anchor: HTMLElement, onApply: (patch: ImageAttributesPatch) => void): void {
	const menu = new Menu();
	for (const option of BORDER_SIZE_OPTIONS) {
		menu.addItem((item) => {
			item.setTitle(t(`imageToolbar.${option.labelKey}`));
			item.setChecked(current.border === true && current.borderSize === option.borderSize);
			item.onClick(() => onApply({ border: true, borderSize: option.borderSize }));
		});
	}
	const rect = anchor.getBoundingClientRect();
	menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
}

/**
 * Builds the "Custom size" panel body — header, presets, and width/height fields — hung under the
 * toolbar via `AnchoredPanel`. Not a Modal: this panel is part of the toolbar itself, not a separate
 * dialog. Commits only via Enter or the header's Apply button (see buildPanelHeader).
 */
function buildSizePanel(
	current: { width?: string; height?: string },
	onApply: (patch: ImageAttributesPatch) => void,
	onClose: () => void,
): HTMLElement {
	const panel = createDiv({ cls: 'confluence-image-size-panel' });

	let widthInput!: HTMLInputElement;
	let heightInput!: HTMLInputElement;

	const commit = (): void => {
		onApply({ width: widthInput.value.trim() || undefined, height: heightInput.value.trim() || undefined });
	};
	// Clears the fields to blank (Reset), not back to the value the panel opened with — Apply still has
	// to be clicked to actually commit it.
	const reset = (): void => {
		widthInput.value = '';
		heightInput.value = '';
	};

	panel.appendChild(buildPanelHeader(t('imageToolbar.customSize'), reset, onClose, () => { commit(); onClose(); }));

	const presets = panel.createDiv({ cls: 'confluence-image-size-presets' });
	for (const preset of SIZE_PRESETS) {
		const active = current.width === preset.width;
		presets.appendChild(makeChoiceButton(t(`imageToolbar.${preset.labelKey}`), active, () => {
			onApply({ width: preset.width, height: undefined });
			onClose();
		}));
	}

	const fields = panel.createDiv({ cls: 'confluence-image-size-fields' });
	const widthField = fields.createDiv({ cls: 'confluence-image-size-field' });
	widthField.createSpan({ cls: 'confluence-image-size-field-icon' }, (el) => setIcon(el, 'move-horizontal'));
	widthInput = widthField.createEl('input', {
		cls: 'confluence-image-size-input',
		attr: { type: 'number', min: '1', placeholder: t('imageToolbar.width') },
	});
	widthInput.value = current.width ?? '';

	const heightField = fields.createDiv({ cls: 'confluence-image-size-field' });
	heightField.createSpan({ cls: 'confluence-image-size-field-icon' }, (el) => setIcon(el, 'move-vertical'));
	heightInput = heightField.createEl('input', {
		cls: 'confluence-image-size-input',
		attr: { type: 'number', min: '1', placeholder: t('imageToolbar.height') },
	});
	heightInput.value = current.height ?? '';

	for (const input of [widthInput, heightInput]) {
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') { commit(); onClose(); }
			if (evt.key === 'Escape') { onClose(); }
		});
	}

	window.setTimeout(() => widthInput.focus(), 0);
	return panel;
}

/**
 * Builds the "Alt text & caption" panel body — same header chrome as buildSizePanel, with two separate
 * text fields. Alt text (`ac:alt`) is invisible accessibility metadata; caption (`ac:caption`, a
 * `cpp-caption:` modifier — see storageXhtml.ts) is visible text shown under the image.
 */
function buildCaptionPanel(
	current: Pick<ImageAttributes, 'alt' | 'caption'>,
	onApply: (patch: ImageAttributesPatch) => void,
	onClose: () => void,
): HTMLElement {
	const panel = createDiv({ cls: 'confluence-image-size-panel' });

	let altInput!: HTMLInputElement;
	let captionInput!: HTMLInputElement;

	const commit = (): void => {
		onApply({ alt: altInput.value.trim(), caption: captionInput.value.trim() || undefined });
	};
	const reset = (): void => {
		altInput.value = '';
		captionInput.value = '';
	};

	panel.appendChild(buildPanelHeader(t('imageToolbar.altCaption'), reset, onClose, () => { commit(); onClose(); }));

	const altField = panel.createDiv({ cls: 'confluence-image-caption-field' });
	altField.createEl('label', { cls: 'confluence-image-caption-label', text: t('imageToolbar.altTextLabel') });
	altInput = altField.createEl('input', {
		cls: 'confluence-image-caption-input',
		attr: { type: 'text', placeholder: t('imageToolbar.altTextPlaceholder') },
	});
	altInput.value = current.alt;

	const captionField = panel.createDiv({ cls: 'confluence-image-caption-field' });
	captionField.createEl('label', { cls: 'confluence-image-caption-label', text: t('imageToolbar.captionLabel') });
	captionInput = captionField.createEl('input', {
		cls: 'confluence-image-caption-input',
		attr: { type: 'text', placeholder: t('imageToolbar.captionPlaceholder') },
	});
	captionInput.value = current.caption ?? '';

	for (const input of [altInput, captionInput]) {
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') { commit(); onClose(); }
			if (evt.key === 'Escape') { onClose(); }
		});
	}

	window.setTimeout(() => altInput.focus(), 0);
	return panel;
}

/**
 * A toolbar widget appended directly after the standalone image-embed line the cursor is currently on
 * (a line that is nothing but `![[image.png|...]]` / `![alt](image.png)`), via a block decoration
 * anchored to the SOURCE TEXT — not to Obsidian's rendered <img>. Clicking an image in Live Preview
 * moves the cursor onto its line, which is what makes the toolbar appear; moving the cursor elsewhere
 * makes it disappear.
 *
 * Alignment and the border toggle are always-visible icon buttons so their state is visible at a glance
 * via `is-active` — clicking the active align button clears it. Size opens the "Custom size" panel via
 * `AnchoredPanel` (portalled to document.body). Border color/thickness open a native `obsidian.Menu`.
 * Both sidestep CodeMirror's content container clipping any panel that needs to render outside the
 * block widget's own box.
 */
class ImageAttributesToolbarWidget extends WidgetType {
	// Portalled to document.body (see AnchoredPanel) rather than a child of the widget's own DOM, so they
	// survive outliving `wrapper` visually — which also means they must be torn down explicitly on
	// destroy(), since removing `wrapper` from the document does nothing to them.
	private sizePanel: AnchoredPanel | null = null;
	private captionPanel: AnchoredPanel | null = null;

	constructor(private app: App, private embed: ImageEmbedMatch, private lineFrom: number) { super(); }

	eq(other: ImageAttributesToolbarWidget): boolean {
		return this.lineFrom === other.lineFrom
			&& this.embed.matchFrom === other.embed.matchFrom
			&& this.embed.matchTo === other.embed.matchTo
			&& this.embed.alias === other.embed.alias;
	}

	toDOM(view: EditorView): HTMLElement {
		const wrapper = createDiv({ cls: 'confluence-image-toolbar-wrapper' });
		const bar = wrapper.createDiv({ cls: 'confluence-image-toolbar' });
		const current = parseImageAttributes(this.embed.alias);
		this.sizePanel = new AnchoredPanel();
		this.captionPanel = new AnchoredPanel();
		// Only one of the two AnchoredPanels this widget owns is ever open at once — each button closes
		// both before opening its own, so opening one always replaces the other rather than stacking.
		const closeAllPanels = (): void => {
			this.sizePanel?.close();
			this.captionPanel?.close();
		};
		// Guards against a dispatch re-entering while CodeMirror is still applying the previous one.
		let dispatching = false;

		const applyPatch = (patch: ImageAttributesPatch): void => {
			if (dispatching) return;
			dispatching = true;
			try {
				const next = stringifyImageAttributes({ ...parseImageAttributes(this.embed.alias), ...patch });
				const insert = this.embed.needsPipeInsertion && next ? `|${next}` : next;
				view.dispatch({ changes: { from: this.lineFrom + this.embed.aliasFrom, to: this.lineFrom + this.embed.aliasTo, insert } });
			} finally {
				dispatching = false;
			}
		};

		const alignCluster = bar.createDiv({ cls: 'confluence-image-toolbar-cluster' });
		for (const btn of ALIGN_BUTTONS) {
			const active = current.align === btn.align && !current.wrap;
			alignCluster.appendChild(makeIconButton(btn.icon, t(`imageToolbar.${btn.labelKey}`), () => {
				closeAllPanels();
				applyPatch(active ? { align: undefined, wrap: undefined } : { align: btn.align, wrap: undefined });
			}, active));
		}

		const wrapCluster = bar.createDiv({ cls: 'confluence-image-toolbar-cluster' });
		for (const btn of WRAP_BUTTONS) {
			const active = current.align === btn.align && current.wrap === true;
			wrapCluster.appendChild(makeIconButton(btn.icon, t(`imageToolbar.${btn.labelKey}`), () => {
				closeAllPanels();
				applyPatch(active ? { align: undefined, wrap: undefined } : { align: btn.align, wrap: true });
			}, active));
		}

		bar.createDiv({ cls: 'confluence-image-toolbar-sep' });

		// Border: an instant on/off toggle, plus separate Color/Size dropdown triggers — three distinct
		// click targets so "is there a border", "what color", and "how thick" stay independently visible
		// and settable, instead of conflating them into one combined control.
		bar.appendChild(makeIconButton('square', t('imageToolbar.border'), () => {
			closeAllPanels();
			applyPatch(current.border ? { border: false, borderSize: undefined, borderColor: undefined } : { border: true });
		}, current.border ?? false));

		bar.appendChild(makeMenuTriggerButton(t('imageToolbar.borderColorLabel'), Boolean(current.borderColor), (evt) => {
			closeAllPanels();
			showBorderColorMenu(current, evt.currentTarget as HTMLElement, applyPatch);
		}));

		bar.appendChild(makeMenuTriggerButton(t('imageToolbar.borderSizeLabel'), Boolean(current.borderSize), (evt) => {
			closeAllPanels();
			showBorderSizeMenu(current, evt.currentTarget as HTMLElement, applyPatch);
		}));

		bar.createDiv({ cls: 'confluence-image-toolbar-sep' });

		// Anchored to `bar` (the whole toolbar), not the button itself — see AnchoredPanelOptions.anchor —
		// so the panel starts flush under the toolbar's own left edge regardless of where the Size button
		// happens to sit in it.
		bar.appendChild(makeIconButton('confluence-image-dimensions', t('imageToolbar.size'), () => {
			if (this.sizePanel?.isOpen()) { closeAllPanels(); return; }
			closeAllPanels();
			this.sizePanel?.open({
				anchor: bar,
				build: () => buildSizePanel(current, applyPatch, closeAllPanels),
			});
		}, Boolean(current.width)));

		bar.appendChild(makeIconButton('quote', t('imageToolbar.altCaption'), () => {
			if (this.captionPanel?.isOpen()) { closeAllPanels(); return; }
			closeAllPanels();
			this.captionPanel?.open({
				anchor: bar,
				build: () => buildCaptionPanel(current, applyPatch, closeAllPanels),
			});
		}, Boolean(current.alt || current.caption)));

		return wrapper;
	}

	// Portalled panels (see `sizePanel`/`captionPanel`) live outside `wrapper` and so don't disappear
	// when CodeMirror discards this widget's DOM (cursor moved elsewhere, doc changed) — without this
	// they'd leak as orphaned elements on document.body.
	destroy(): void {
		this.sizePanel?.close();
		this.captionPanel?.close();
	}

	// Let the widget's own DOM (buttons, panel inputs) handle events natively instead of CodeMirror
	// reprocessing them as document interactions.
	ignoreEvent(): boolean { return true; }
}

/**
 * Only the standalone image-embed line the cursor is currently on gets a toolbar — clicking an image in
 * Live Preview moves the cursor onto its line (revealing the raw source), same as it always did, so this
 * naturally shows the toolbar only for the image being interacted with and hides it everywhere else,
 * without needing to detect clicks/hovers on Obsidian's own rendering directly.
 */
function buildDecorations(state: EditorState, app: App, isEnabled: () => boolean): DecorationSet {
	if (!isEnabled()) return Decoration.none;

	const cursor = state.selection.main.head;
	const activeLine = state.doc.lineAt(cursor);
	const embeds = findImageEmbedsOnLine(activeLine.text);
	if (embeds.length !== 1) return Decoration.none;
	const embed = embeds[0]!;
	if (!isStandaloneImageEmbed(activeLine.text, embed)) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	builder.add(activeLine.to, activeLine.to, Decoration.widget({
		widget: new ImageAttributesToolbarWidget(app, embed, activeLine.from),
		block: true,
		side: 1,
	}));
	return builder.finish();
}

function buildDecorationsSafely(state: EditorState, app: App, isEnabled: () => boolean): DecorationSet {
	try {
		return buildDecorations(state, app, isEnabled);
	} catch (e) {
		console.error('[confluence-image-toolbar] failed to build decorations', e);
		return Decoration.none;
	}
}

/**
 * CodeMirror extension: appends an attributes toolbar right after the standalone image-embed line the
 * cursor is on. A block-widget decoration (`Decoration.widget({block: true})`) can only be provided from
 * a StateField, never a ViewPlugin — CM6 throws `RangeError: Block decorations may not be specified via
 * plugins` if it's tried via ViewPlugin. isEnabled is re-read on every document/selection change, so a
 * settings toggle takes effect on the next edit or cursor move without reloading.
 */
export function imageAttributesToolbarExtension(app: App, isEnabled: () => boolean): Extension {
	return StateField.define<DecorationSet>({
		create: (state) => buildDecorationsSafely(state, app, isEnabled),
		update: (value, tr) => (tr.docChanged || tr.selection) ? buildDecorationsSafely(tr.state, app, isEnabled) : value,
		provide: (field) => EditorView.decorations.from(field),
	});
}
