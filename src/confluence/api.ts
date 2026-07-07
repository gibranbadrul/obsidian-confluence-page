import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';
import * as https from 'https';
import * as http from 'http';
import { URL as NodeURL } from 'url';

export class ConfluenceApiError extends Error {
	constructor(public status: number, public code: ConfluenceErrorCode, message: string, public details?: string) {
		super(message);
		this.name = 'ConfluenceApiError';
	}
}

export type ConfluenceErrorCode =
	| 'auth_failed'
	| 'not_found'
	| 'version_conflict'
	| 'rate_limited'
	| 'network'
	| 'invalid_response'
	| 'unknown';

export interface PageInfo {
	id: string;
	title: string;
	version: number;
	type: string;
	spaceKey?: string;
}

export interface UpdatePagePayload {
	title: string;
	storageXhtml: string;
	newVersion: number;
}

export interface AttachmentMeta {
	id: string;
	filename: string;
	version: number;
	mediaType?: string;
}

export type ConfluenceAuthType = 'basic' | 'bearer';

export interface ConfluenceApiConfig {
	baseUrl: string;
	authType: ConfluenceAuthType;
	/** Required for Basic auth. Cloud uses email; Server usually uses a domain account. Ignored for Bearer auth. */
	username: string;
	/** Basic auth password/API token or Bearer PAT. */
	apiToken: string;
}

type JsonRecord = Record<string, unknown>;

/**
 * Confluence REST v1 client using Obsidian requestUrl where possible.
 *
 * Design notes:
 * - baseUrl is normalized without trailing slash, e.g. https://xxx.atlassian.net/wiki
 * - Basic Auth: Authorization: Basic base64(username:token)
 * - Errors are normalized as ConfluenceApiError with categorized codes for callers.
 */
export class ConfluenceApi {
	private baseUrl: string;
	private authHeader: string;

	constructor(config: ConfluenceApiConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, '');
		if (config.authType === 'bearer') {
			this.authHeader = `Bearer ${config.apiToken}`;
		} else {
			this.authHeader = `Basic ${encodeBase64Utf8(`${config.username}:${config.apiToken}`)}`;
		}
	}

	/** GET /rest/api/user/current — validates credentials and returns current user displayName. */
	async validateAuth(): Promise<{ ok: true; displayName: string } | { ok: false; error: string }> {
		try {
			const res = await this.request({
				method: 'GET',
				url: `${this.baseUrl}/rest/api/user/current`,
			});
			const data = parseJsonObject(res.text, 'Confluence current user response');
			return {
				ok: true,
				displayName: readOptionalString(data, 'displayName') ?? readOptionalString(data, 'email') ?? '<unknown>',
			};
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	}

	/** GET page metadata, including version and title. */
	async getPage(pageId: string): Promise<PageInfo> {
		const res = await this.request({
			method: 'GET',
			url: `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=version,space`,
		});
		const data = parseJsonObject(res.text, 'Confluence page response');
		const version = readOptionalObject(data, 'version');
		const space = readOptionalObject(data, 'space');

		return {
			id: readRequiredString(data, 'id', 'Confluence page response'),
			title: readRequiredString(data, 'title', 'Confluence page response'),
			version: readOptionalNumber(version, 'number') ?? 1,
			type: readRequiredString(data, 'type', 'Confluence page response'),
			spaceKey: space ? readOptionalString(space, 'key') : undefined,
		};
	}

	/** POST creates a child page. Returns new page ID and web URL for frontmatter writeback. */
	async createPage(opts: {
		spaceKey: string;
		parentId: string;
		title: string;
		storageXhtml: string;
	}): Promise<{ id: string; title: string; webUrl: string }> {
		const body = JSON.stringify({
			type: 'page',
			title: opts.title,
			space: { key: opts.spaceKey },
			ancestors: [{ id: opts.parentId }],
			body: {
				storage: {
					value: opts.storageXhtml,
					representation: 'storage',
				},
			},
		});
		// Obsidian requestUrl can trigger Confluence Server XSRF false positives for POST JSON bodies.
		// Send POST through Node https, matching multipart uploads. PUT via requestUrl remains fine.
		const bodyBuf = Buffer.from(body, 'utf8');
		const url = `${this.baseUrl}/rest/api/content`;
		const { status, text } = await nodeHttpsRequest({
			url,
			method: 'POST',
			headers: {
				Authorization: this.authHeader,
				Accept: 'application/json',
				'X-Atlassian-Token': 'no-check',
				'Content-Type': 'application/json',
				'Content-Length': String(bodyBuf.length),
			},
			body: bodyBuf,
		});
		if (status < 200 || status >= 300) {
			const code = classifyError(status);
			const details = truncate(text, 500);
			throw new ConfluenceApiError(status, code, buildErrorMessage('POST', url, status, details), details);
		}
		const data = parseJsonObject(text, 'Confluence create page response');
		const links = readOptionalObject(data, '_links');
		const id = readRequiredString(data, 'id', 'Confluence create page response');
		const base = links ? readOptionalString(links, 'base') ?? this.baseUrl : this.baseUrl;
		const webui = links ? readOptionalString(links, 'webui') ?? `/pages/viewpage.action?pageId=${id}` : `/pages/viewpage.action?pageId=${id}`;

		return {
			id,
			title: readRequiredString(data, 'title', 'Confluence create page response'),
			webUrl: base + webui,
		};
	}

	/** PUT updates a page. 409 is mapped to version_conflict so callers can retry. */
	async updatePage(pageId: string, payload: UpdatePagePayload): Promise<void> {
		const body = JSON.stringify({
			id: pageId,
			type: 'page',
			title: payload.title,
			version: { number: payload.newVersion },
			body: {
				storage: {
					value: payload.storageXhtml,
					representation: 'storage',
				},
			},
		});
		await this.request({
			method: 'PUT',
			url: `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}`,
			contentType: 'application/json',
			body,
			extraHeaders: { 'X-Atlassian-Token': 'no-check' },
		});
	}

	/** Lists attachments by filename to decide whether to create or update attachment data. */
	async findAttachmentByFilename(pageId: string, filename: string): Promise<AttachmentMeta | null> {
		const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?filename=${encodeURIComponent(filename)}`;
		const res = await this.request({ method: 'GET', url });
		const data = parseJsonObject(res.text, 'Confluence attachment search response');
		const first = readRecordArray(data, 'results')[0];
		if (!first) return null;
		const metadata = readOptionalObject(first, 'metadata');

		return {
			id: readRequiredString(first, 'id', 'Confluence attachment search result'),
			filename: readRequiredString(first, 'title', 'Confluence attachment search result'),
			version: readOptionalNumber(readOptionalObject(first, 'version'), 'number') ?? 1,
			mediaType: metadata ? readOptionalString(metadata, 'mediaType') : undefined,
		};
	}

	/** Creates an attachment: POST /rest/api/content/{pageId}/child/attachment (multipart). */
	async createAttachment(pageId: string, filename: string, data: ArrayBuffer, mimeType: string): Promise<AttachmentMeta> {
		const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment`;
		const res = await this.uploadMultipart(url, filename, data, mimeType);
		const parsed = parseJsonObject(res.text, 'Confluence create attachment response');
		const createdAttachment = readRecordArray(parsed, 'results')[0];
		if (!createdAttachment) throw new ConfluenceApiError(500, 'invalid_response', 'Confluence returned an empty results array');
		return this.createAttachmentMeta(createdAttachment, 'Confluence create attachment response');
	}

	/** Updates existing attachment binary content: POST /rest/api/content/{pageId}/child/attachment/{attId}/data. */
	async updateAttachment(pageId: string, attachmentId: string, filename: string, data: ArrayBuffer, mimeType: string): Promise<AttachmentMeta> {
		const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}/child/attachment/${encodeURIComponent(attachmentId)}/data`;
		const res = await this.uploadMultipart(url, filename, data, mimeType);
		const parsed = parseJsonObject(res.text, 'Confluence update attachment response');
		const version = readOptionalObject(parsed, 'version');

		return {
			id: readOptionalString(parsed, 'id') ?? attachmentId,
			filename: readOptionalString(parsed, 'title') ?? filename,
			version: readOptionalNumber(version, 'number') ?? 1,
		};
	}

	private createAttachmentMeta(data: JsonRecord, context: string): AttachmentMeta {
		const version = readOptionalObject(data, 'version');

		return {
			id: readRequiredString(data, 'id', context),
			filename: readRequiredString(data, 'title', context),
			version: readOptionalNumber(version, 'number') ?? 1,
		};
	}

	private async uploadMultipart(url: string, filename: string, data: ArrayBuffer, mimeType: string): Promise<RequestUrlResponse> {
		// Multipart upload does not use fetch or Obsidian requestUrl because Confluence Server can still reject binary bodies as XSRF.
		// Use Electron/Node https directly. This FormData serialization format has been validated against Confluence.
		const fd = new FormData();
		fd.append('file', new Blob([data], { type: mimeType }), filename);
		const tmp = new Request('http://placeholder.invalid/', { method: 'POST', body: fd });
		const contentType = tmp.headers.get('Content-Type') ?? 'multipart/form-data';
		const bodyBuf = Buffer.from(await tmp.arrayBuffer());

		const { status, text } = await nodeHttpsRequest({
			url,
			method: 'POST',
			headers: {
				Authorization: this.authHeader,
				Accept: 'application/json',
				'X-Atlassian-Token': 'no-check',
				'Content-Type': contentType,
				'Content-Length': String(bodyBuf.length),
			},
			body: bodyBuf,
		});

		if (status >= 200 && status < 300) {
			return { status, headers: {}, arrayBuffer: new ArrayBuffer(0), json: null, text };
		}
		const code = classifyError(status);
		const details = truncate(text, 500);
		throw new ConfluenceApiError(status, code, buildErrorMessage('POST', url, status, details), details);
	}

	private async request(opts: {
		method: string;
		url: string;
		body?: string | ArrayBuffer;
		contentType?: string;
		extraHeaders?: Record<string, string>;
	}): Promise<RequestUrlResponse> {
		const headers: Record<string, string> = {
			Authorization: this.authHeader,
			Accept: 'application/json',
			...(opts.extraHeaders ?? {}),
		};
		if (opts.contentType) headers['Content-Type'] = opts.contentType;

		const param: RequestUrlParam = {
			method: opts.method,
			url: opts.url,
			headers,
			body: opts.body,
			throw: false,
		};

		let res: RequestUrlResponse;
		try {
			res = await requestUrl(param);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new ConfluenceApiError(0, 'network', `Network request failed: ${msg}`);
		}

		if (res.status >= 200 && res.status < 300) return res;

		const code = classifyError(res.status);
		const details = truncate(safeText(res), 500);
		const message = buildErrorMessage(opts.method, opts.url, res.status, details);
		throw new ConfluenceApiError(res.status, code, message, details);
	}
}

function classifyError(status: number): ConfluenceErrorCode {
	if (status === 401 || status === 403) return 'auth_failed';
	if (status === 404) return 'not_found';
	if (status === 409) return 'version_conflict';
	if (status === 429) return 'rate_limited';
	return 'unknown';
}

function safeText(res: RequestUrlResponse): string {
	try { return res.text ?? ''; } catch { return ''; }
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max) + '...';
}

function buildErrorMessage(method: string, url: string, status: number, details: string): string {
	const path = url.replace(/^https?:\/\/[^/]+/, '');
	return `Confluence ${method} ${path} → ${status}${details ? ': ' + details : ''}`;
}

function parseJsonObject(text: string, context: string): JsonRecord {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		throw new ConfluenceApiError(500, 'invalid_response', `${context}: invalid JSON: ${message}`);
	}

	if (!isJsonRecord(parsed)) {
		throw new ConfluenceApiError(500, 'invalid_response', `${context}: expected a JSON object`);
	}

	return parsed;
}

function readRequiredString(record: JsonRecord, key: string, context: string): string {
	const value = record[key];
	if (typeof value === 'string') return value;
	throw new ConfluenceApiError(500, 'invalid_response', `${context}: missing string field "${key}"`);
}

function readOptionalString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
}

function readOptionalNumber(record: JsonRecord | undefined, key: string): number | undefined {
	if (!record) return undefined;
	const value = record[key];
	return typeof value === 'number' ? value : undefined;
}

function readOptionalObject(record: JsonRecord, key: string): JsonRecord | undefined {
	const value = record[key];
	return isJsonRecord(value) ? value : undefined;
}

function readRecordArray(record: JsonRecord, key: string): JsonRecord[] {
	const value = record[key];
	if (!Array.isArray(value)) return [];
	return value.filter(isJsonRecord);
}

function isJsonRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sends requests directly through Electron/Node https/http to avoid browser CORS and requestUrl binary-body handling.
 */
function nodeHttpsRequest(opts: {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: Buffer;
}): Promise<{ status: number; text: string }> {
	return new Promise((resolve, reject) => {
		const parsed = new NodeURL(opts.url);
		const lib = parsed.protocol === 'http:' ? http : https;
		const req = lib.request({
			protocol: parsed.protocol,
			hostname: parsed.hostname,
			port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
			path: parsed.pathname + parsed.search,
			method: opts.method,
			headers: opts.headers,
		}, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8');
				resolve({ status: res.statusCode ?? 0, text });
			});
		});
		req.on('error', (e: Error) => reject(e));
		req.write(opts.body);
		req.end();
	});
}

/** UTF-8 safe Base64 encoding. Electron provides btoa, but browser btoa only accepts latin1 input. */
function encodeBase64Utf8(input: string): string {
	return Buffer.from(input, 'utf8').toString('base64');
}
