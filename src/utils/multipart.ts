export interface MultipartBody {
	contentType: string;
	body: ArrayBuffer;
}

/**
 * Builds a `multipart/form-data` body via the platform's own FormData/Response encoding
 * instead of hand-rolling boundary strings and part headers.
 */
export async function createMultipartBody(fieldName: string, filename: string, data: ArrayBuffer, mimeType: string): Promise<MultipartBody> {
	const form = new FormData();
	form.append(fieldName, new Blob([data], { type: mimeType }), filename);
	form.append('minorEdit', 'true');

	const response = new Response(form);
	const contentType = response.headers.get('content-type');
	if (!contentType) throw new Error('Failed to encode multipart/form-data body');

	return { contentType, body: await response.arrayBuffer() };
}
