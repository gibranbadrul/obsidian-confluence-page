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
