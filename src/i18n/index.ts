import { en, type Messages } from './en';

type Dict = Messages;

const LOCALE = 'en' as const;
const MESSAGES: Dict = en;

export function getLocale(): 'en' {
	return LOCALE;
}

/**
 * Resolve a dotted key path like `settings.section.auth` against the English
 * message dictionary and interpolate `{name}` placeholders from `params`.
 *
 * Missing keys return the key itself so problems are visible during development
 * instead of failing silently.
 */
export function t(path: string, params?: Record<string, string | number>): string {
	const parts = path.split('.');
	let cursor: unknown = MESSAGES;
	for (const p of parts) {
		if (cursor && typeof cursor === 'object' && p in (cursor as Record<string, unknown>)) {
			cursor = (cursor as Record<string, unknown>)[p];
		} else {
			return path;
		}
	}
	if (typeof cursor !== 'string') return path;
	if (!params) return cursor;
	return cursor.replace(/\{(\w+)\}/g, (_m, k: string) => {
		const v = params[k];
		return v === undefined || v === null ? `{${k}}` : String(v);
	});
}
