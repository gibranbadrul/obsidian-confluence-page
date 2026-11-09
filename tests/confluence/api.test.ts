import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUrlMock = vi.hoisted(() => vi.fn());

vi.mock('obsidian', () => ({
	requestUrl: requestUrlMock,
}));

import { ConfluenceApi } from '../../src/confluence/api';

function createApi(): ConfluenceApi {
	return new ConfluenceApi({
		baseUrl: 'https://example.atlassian.net/wiki',
		authType: 'bearer',
		username: '',
		apiToken: 'token',
	});
}

function okAttachmentResponse(id = 'att1', filename = 'diagram.svg') {
	return {
		status: 200,
		text: JSON.stringify({
			results: [
				{
					id,
					title: filename,
					version: { number: 1 },
				},
			],
		}),
	};
}

function requestBodyText(): string {
	const request = requestUrlMock.mock.calls[0]?.[0];
	return new TextDecoder().decode(request.body as ArrayBuffer);
}

describe('ConfluenceApi attachment uploads', () => {
	beforeEach(() => {
		requestUrlMock.mockReset();
		requestUrlMock.mockResolvedValue(okAttachmentResponse());
	});

	it('sends minorEdit when creating or updating attachments by filename', async () => {
		await createApi().createOrUpdateAttachment(
			'123',
			'diagram.svg',
			new TextEncoder().encode('<svg />').buffer,
			'image/svg+xml',
		);

		const request = requestUrlMock.mock.calls[0]?.[0];
		expect(request.method).toBe('PUT');
		expect(request.url).toBe('https://example.atlassian.net/wiki/rest/api/content/123/child/attachment');
		expect(request.headers['X-Atlassian-Token']).toBe('nocheck');
		expect(request.contentType).toContain('multipart/form-data; boundary=');
		expect(requestBodyText()).toContain('Content-Disposition: form-data; name="minorEdit"\r\n\r\ntrue');
	});

	it('sends minorEdit when updating attachment data by attachment ID', async () => {
		await createApi().updateAttachment(
			'123',
			'att1',
			'diagram.svg',
			new TextEncoder().encode('<svg />').buffer,
			'image/svg+xml',
		);

		const request = requestUrlMock.mock.calls[0]?.[0];
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://example.atlassian.net/wiki/rest/api/content/123/child/attachment/att1/data');
		expect(request.headers['X-Atlassian-Token']).toBe('nocheck');
		expect(requestBodyText()).toContain('Content-Disposition: form-data; name="minorEdit"\r\n\r\ntrue');
	});
});

describe('ConfluenceApi wide images', () => {
	beforeEach(() => requestUrlMock.mockReset());

	it('publishes a marked image with its wide layout and pixel width and restores alt text', async () => {
		const image = (alt: string) => ({
			type: 'mediaSingle',
			attrs: { layout: 'center', width: 1200, widthType: 'pixel' },
			content: [{ type: 'media', attrs: { id: 'file-id', alt } }],
		});
		const ordinaryImage = image('Ordinary image');
		requestUrlMock
			.mockResolvedValueOnce({ status: 200, text: '{"asyncId":"task-id"}' })
			.mockResolvedValueOnce({
				status: 200,
				text: JSON.stringify({
					value: JSON.stringify({ type: 'doc', version: 1, content: [image('marker'), ordinaryImage] }),
				}),
			})
			.mockResolvedValueOnce({ status: 200 });
		const api = createApi();
		const storageXhtml = '<ac:image ac:alt="marker" />';
		const adf = await api.convertWideImages('123', storageXhtml, new Map([['marker', { alt: 'Architecture', width: '1300' }]]));
		await api.updatePage('123', { title: 'Test', storageXhtml, newVersion: 2, adf });

		expect(requestUrlMock.mock.calls[0]?.[0].url).toContain('/convert/async/atlas_doc_format?contentIdContext=123');
		const update = requestUrlMock.mock.calls[2]?.[0];
		expect(update.url).toContain('/api/v2/pages/123');
		expect(JSON.parse(update.body).body).toEqual({ representation: 'atlas_doc_format', value: adf });
		expect(JSON.parse(adf).content).toEqual([
			{ ...image('Architecture'), attrs: { layout: 'wide', width: 1300, widthType: 'pixel' } },
			ordinaryImage,
		]);
	});

	it('fails before publishing if conversion loses a wide image marker', async () => {
		requestUrlMock
			.mockResolvedValueOnce({ status: 200, text: '{"asyncId":"task-id"}' })
			.mockResolvedValueOnce({
				status: 200,
				text: JSON.stringify({ value: '{"type":"doc","version":1,"content":[]}' }),
			});
		await expect(createApi().convertWideImages('123', '', new Map([['marker', { alt: 'Architecture', width: '1300' }]])))
			.rejects.toThrow('could not identify every wide image');
	});
});
