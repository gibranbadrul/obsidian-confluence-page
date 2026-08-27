import { describe, expect, it } from 'vitest';
import { parseImageAttributes, stringifyImageAttributes } from '../../src/confluence/storageXhtml';

describe('stringifyImageAttributes', () => {
	it('round-trips size, align, and border modifiers through parseImageAttributes', () => {
		const cases = ['cpp-w-300', 'cpp-h-200', 'cpp-left', 'cpp-center', 'cpp-right', 'cpp-border', 'cpp-border-subtle', 'cpp-border-medium', 'cpp-border-bold', 'cpp-border-color-light', 'cpp-border-color-medium', 'cpp-border-color-dark', 'cpp-caption:A visible caption'];

		for (const raw of cases) {
			expect(stringifyImageAttributes(parseImageAttributes(raw))).toBe(raw);
		}
	});

	it('reads caption as an independent token from alt text', () => {
		expect(parseImageAttributes('cpp-caption:A visible caption')).toEqual({ alt: '', caption: 'A visible caption' });
		expect(parseImageAttributes('Alt text|cpp-caption:A visible caption')).toEqual({ alt: 'Alt text', caption: 'A visible caption' });
		expect(stringifyImageAttributes({ alt: 'Alt text', caption: 'A visible caption' })).toBe('Alt text|cpp-caption:A visible caption');
	});

	it('round-trips the wrap modifier alongside left/right align', () => {
		expect(parseImageAttributes('cpp-left|cpp-wrap')).toEqual({ alt: '', align: 'left', wrap: true });
		expect(stringifyImageAttributes({ alt: '', align: 'left', wrap: true })).toBe('cpp-left|cpp-wrap');
		expect(stringifyImageAttributes({ alt: '', align: 'right', wrap: true })).toBe('cpp-right|cpp-wrap');
	});

	it('drops the wrap modifier when align is center — there is no wrap-center', () => {
		expect(stringifyImageAttributes({ alt: '', align: 'center', wrap: true })).toBe('cpp-center');
	});

	it('reads border color as an independent token from border size', () => {
		expect(parseImageAttributes('cpp-border-color-dark')).toEqual({ alt: '', border: true, borderColor: 'dark' });
		expect(parseImageAttributes('cpp-border-color-dark|cpp-border-bold')).toEqual({ alt: '', border: true, borderColor: 'dark', borderSize: 'bold' });
	});

	it('reads width and height as independent tokens, either or both', () => {
		expect(parseImageAttributes('cpp-w-300')).toEqual({ alt: '', width: '300' });
		expect(parseImageAttributes('cpp-h-200')).toEqual({ alt: '', height: '200' });
		expect(parseImageAttributes('cpp-w-300|cpp-h-200')).toEqual({ alt: '', width: '300', height: '200' });
	});

	it('serializes alt text combined with modifiers in a fixed alt/size/align/border order', () => {
		const attrs = parseImageAttributes('A caption|cpp-w-300|cpp-h-200|cpp-border-bold|cpp-center');
		expect(stringifyImageAttributes(attrs)).toBe('A caption|cpp-w-300|cpp-h-200|cpp-center|cpp-border-bold');
	});

	it('serializes plain alt text with no modifiers unchanged', () => {
		expect(stringifyImageAttributes(parseImageAttributes('A screenshot'))).toBe('A screenshot');
	});

	it('treats unprefixed keywords as plain alt text, not modifiers', () => {
		// The cpp- prefix is what lets a genuine alt text of "300", "border", "center", etc. survive
		// unchanged — this is the whole point of namespacing the tokens.
		const cases = ['300', 'w-300', 'h-200', 'border', 'center', 'border-subtle'];
		for (const raw of cases) {
			expect(parseImageAttributes(raw)).toEqual({ alt: raw });
		}
	});

	it('serializes no attributes to an empty string', () => {
		expect(stringifyImageAttributes({ alt: '' })).toBe('');
	});
});
