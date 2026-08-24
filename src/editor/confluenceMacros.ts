import type { Editor } from 'obsidian';
import { Notice } from 'obsidian';
import { t } from '../i18n';
import { buildIgnoreBlock, IGNORE_LINE_MARKER, IGNORE_LINE_RE, TOC_MARKER } from '../confluence/markers';

export function insertConfluenceIgnoreLine(editor: Editor): void {
	const selection = editor.getSelection();
	const startCursor = selection ? editor.getCursor('from') : editor.getCursor();
	const endCursor = selection ? editor.getCursor('to') : startCursor;
	const endLine = selection && endCursor.ch === 0 && endCursor.line > startCursor.line
		? endCursor.line - 1
		: endCursor.line;
	let insertedCount = 0;

	for (let lineNumber = endLine; lineNumber >= startCursor.line; lineNumber -= 1) {
		const lineText = editor.getLine(lineNumber);
		if (IGNORE_LINE_RE.test(lineText)) continue;

		const indentationLength = lineText.match(/^[\t ]*/)?.[0].length ?? 0;
		const markerSuffix = lineText.slice(indentationLength) ? ' ' : '';
		editor.replaceRange(
			IGNORE_LINE_MARKER + markerSuffix,
			{ line: lineNumber, ch: indentationLength },
		);
		insertedCount += 1;

		if (!selection && lineNumber === startCursor.line && startCursor.ch >= indentationLength) {
			editor.setCursor({
				line: startCursor.line,
				ch: startCursor.ch + IGNORE_LINE_MARKER.length + markerSuffix.length,
			});
		}
	}

	new Notice(t(insertedCount > 0 ? 'notice.ignoreLineInserted' : 'notice.ignoreLineAlreadyExists'));
}

export function insertConfluenceIgnoreBlock(editor: Editor): void {
	const selection = editor.getSelection();
	const cursor = editor.getCursor();
	const prefix = cursor.ch === 0 ? '' : '\n';
	const ignoreBlock = buildIgnoreBlock(selection);

	editor.replaceSelection(prefix + ignoreBlock + '\n');

	if (!selection) {
		editor.setCursor({
			line: cursor.line + (prefix ? 2 : 1),
			ch: 0,
		});
	}

	new Notice(t('notice.ignoreBlockInserted'));
}

export function insertConfluenceToc(editor: Editor): void {
	const cursor = editor.getCursor();
	const prefix = cursor.ch === 0 ? '' : '\n';
	editor.replaceSelection(`${prefix}${TOC_MARKER}\n`);
	new Notice(t('notice.tocInserted'));
}
