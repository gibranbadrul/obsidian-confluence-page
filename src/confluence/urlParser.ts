export type ConfluenceParentTarget =
	| {
		type: 'page';
		id: string;
		url: string;
	}
	| {
		type: 'folder';
		id: string;
		url: string;
		spaceKey?: string;
	};

/**
 * Parses a page ID from a Confluence page URL.
 *
 * Supports two common URL formats:
 * - https://xxx.atlassian.net/wiki/spaces/SPACE/pages/123456/Title
 * - https://xxx.atlassian.net/wiki/pages/viewpage.action?pageId=123456
 */
export function parsePageIdFromUrl(url: string): string | null {
	if (!url) return null;

	const pathMatch = url.match(/\/pages\/(\d+)(?:\/|$|\?|#)/);
	if (pathMatch && pathMatch[1]) return pathMatch[1];

	const queryMatch = url.match(/[?&]pageId=(\d+)/i);
	if (queryMatch && queryMatch[1]) return queryMatch[1];

	return null;
}

/**
 * Parses a Confluence Cloud folder ID from a folder URL.
 *
 * Supports common Cloud folder URL forms:
 * - https://xxx.atlassian.net/wiki/spaces/SPACE/folder/123456/Title
 * - https://xxx.atlassian.net/wiki/spaces/SPACE/folders/123456/Title
 * - https://xxx.atlassian.net/wiki/folder/123456
 * - https://xxx.atlassian.net/wiki/folders/123456
 */
export function parseFolderIdFromUrl(url: string): string | null {
	return parseFolderTargetFromUrl(url)?.id ?? null;
}

export function parseConfluenceParentTargetFromUrl(url: string): ConfluenceParentTarget | null {
	const pageId = parsePageIdFromUrl(url);
	if (pageId) {
		return {
			type: 'page',
			id: pageId,
			url,
		};
	}

	return parseFolderTargetFromUrl(url);
}

function parseFolderTargetFromUrl(url: string): ConfluenceParentTarget | null {
	if (!url) return null;

	const spaceScopedMatch = url.match(/\/spaces\/([^/?#]+)\/folders?\/(\d+)(?:\/|$|\?|#)/i);
	if (spaceScopedMatch?.[1] && spaceScopedMatch[2]) {
		return {
			type: 'folder',
			id: spaceScopedMatch[2],
			url,
			spaceKey: decodeUrlSegment(spaceScopedMatch[1]),
		};
	}

	const genericMatch = url.match(/\/folders?\/(\d+)(?:\/|$|\?|#)/i);
	if (genericMatch?.[1]) {
		return {
			type: 'folder',
			id: genericMatch[1],
			url,
		};
	}

	return null;
}

function decodeUrlSegment(value: string): string {
	try { return decodeURIComponent(value); } catch { return value; }
}
