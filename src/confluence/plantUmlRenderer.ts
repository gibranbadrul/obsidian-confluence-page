import { requestUrl } from 'obsidian';
import { type DiagramBlock } from './markdownConverter';
import { type Logger } from '../utils/logger';

/**
 * PlantUML text encoding and remote PNG fetch.
 *
 * Encoding algorithm from PlantUML:
 *   utf-8 bytes -> raw deflate -> custom base64 alphabet
 *
 * Alphabet, different from standard base64:
 *   0-9A-Za-z plus '-' and '_', in the official PlantUML order.
 *
 * raw deflate follows upstream behavior: browser-native CompressionStream('deflate-raw').
 * Electron / Chrome >= 80 supports it, so Obsidian desktop can use it directly.
 */
const RENDER_TIMEOUT_MS = 10_000;

export class PlantUmlRenderer {
	constructor(
		private serverUrl: string,
		private logger: Logger,
	) {}

	async renderAll(blocks: DiagramBlock[]): Promise<Array<{ block: DiagramBlock; png: ArrayBuffer } | null>> {
		const out: Array<{ block: DiagramBlock; png: ArrayBuffer } | null> = [];
		for (const b of blocks) {
			try {
				this.logger.info(`Rendering PlantUML diagram: ${b.filename}`, this.serverUrl);
				const png = await withTimeout(
					this.renderOne(b.source),
					RENDER_TIMEOUT_MS,
					`PlantUML render timed out after ${RENDER_TIMEOUT_MS}ms`,
				);
				this.logger.info(`PlantUML diagram rendered: ${b.filename}`, `${png.byteLength} bytes`);
				out.push({ block: b, png });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.warn(`PlantUML render failed; falling back to code block: ${b.filename}`, msg);
				out.push(null);
			}
		}
		return out;
	}

	private async renderOne(source: string): Promise<ArrayBuffer> {
		const encoded = await encodePlantUml(source);
		const base = this.serverUrl.replace(/\/+$/, '');
		const url = `${base}/png/${encoded}`;
		const res = await requestUrl({ url, method: 'GET', throw: false });
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`PlantUML server returned ${res.status}`);
		}
		return res.arrayBuffer;
	}
}

const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

async function encodePlantUml(source: string): Promise<string> {
	const utf8 = new TextEncoder().encode(source);
	const deflated = await deflateRaw(utf8);
	return encode64(deflated);
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const CS = (window as unknown as { CompressionStream?: typeof CompressionStream }).CompressionStream;
	if (!CS) throw new Error('CompressionStream is unavailable; cannot encode PlantUML');
	const stream = (new Blob([data as BlobPart]).stream() as unknown as PipeThroughReadableStream)
		.pipeThrough<Uint8Array>(new CS('deflate-raw'));
	const buf = await new Response(stream).arrayBuffer();
	return new Uint8Array(buf);
}

interface PipeThroughReadableStream {
	pipeThrough<T>(transform: unknown): ReadableStream<T>;
}

function encode64(data: Uint8Array): string {
	let r = '';
	for (let i = 0; i < data.length; i += 3) {
		const a = data[i]!;
		const b = i + 1 < data.length ? data[i + 1]! : 0;
		const c = i + 2 < data.length ? data[i + 2]! : 0;
		r += PLANTUML_ALPHABET[a >> 2];
		r += PLANTUML_ALPHABET[((a & 0x3) << 4) | (b >> 4)];
		r += PLANTUML_ALPHABET[((b & 0xF) << 2) | (c >> 6)];
		r += PLANTUML_ALPHABET[c & 0x3F];
	}
	return r;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeoutToken = window.setTimeout(() => reject(new Error(message)), ms);
		promise.then(
			(value) => {
				window.clearTimeout(timeoutToken);
				resolve(value);
			},
			(error: unknown) => {
				window.clearTimeout(timeoutToken);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}
