import { webcrypto } from 'node:crypto';

Object.defineProperty(globalThis, 'crypto', {
	value: webcrypto,
	configurable: true,
});

Object.defineProperty(globalThis, 'window', {
	value: globalThis,
	configurable: true,
});

Object.defineProperty(globalThis, 'btoa', {
	value: (input: string) => Buffer.from(input, 'binary').toString('base64'),
	configurable: true,
});
