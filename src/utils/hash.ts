/**
 * Cross-platform sha1 hex encoding.
 * Uses Web Crypto API provided by Electron renderer process.
 */
export async function sha1Hex(input: ArrayBuffer | string): Promise<string> {
	const data = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
	const subtle = window.crypto?.subtle;
	if (subtle?.digest) {
		const buf = await subtle.digest('SHA-1', data);
		return toHex(new Uint8Array(buf));
	}
	throw new Error('crypto.subtle is unavailable');
}

function toHex(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) {
		const b = bytes[i]!;
		s += (b < 16 ? '0' : '') + b.toString(16);
	}
	return s;
}
