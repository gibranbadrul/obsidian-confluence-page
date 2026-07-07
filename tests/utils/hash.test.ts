import { describe, expect, it } from 'vitest';
import { sha1Hex } from '../../src/utils/hash';

describe('sha1Hex', () => {
	it('hashes strings as SHA-1 hex', async () => {
		expect(await sha1Hex('hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});

	it('hashes ArrayBuffer input', async () => {
		const bytes = new TextEncoder().encode('hello');
		expect(await sha1Hex(bytes.buffer)).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
	});
});
