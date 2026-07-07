import { requestUrl } from 'obsidian';
import { type DiagramBlock } from './markdownConverter';
import { type Logger } from '../utils/logger';

/**
 * Mermaid source -> PNG.
 *
 * Uses a remote Kroki service. POST the Mermaid source and receive PNG bytes.
 *
 * Why this does not render locally:
 *   - mermaid npm + canvas can taint the canvas when SVG contains foreignObject, causing toBlob failures.
 *   - mermaid npm + resvg-wasm does not support foreignObject; even after text preprocessing,
 *     resvg does not bundle fonts, so text rendering is unreliable.
 *   - Bundling fonts would make the plugin too large.
 *
 * Users can point mermaidRenderUrl to a self-hosted Kroki instance.
 */
const RENDER_TIMEOUT_MS = 30_000;

export class MermaidRenderer {
	constructor(
		private serverUrl: string,
		private logger: Logger,
	) {}

	async renderAll(blocks: DiagramBlock[]): Promise<Array<{ block: DiagramBlock; png: ArrayBuffer } | null>> {
		const results: Array<{ block: DiagramBlock; png: ArrayBuffer } | null> = [];
		for (const b of blocks) {
			try {
				this.logger.info(`Rendering Mermaid diagram: ${b.filename}`, this.serverUrl);
				const png = await this.renderWithRetry(b.source);
				this.logger.info(`Mermaid diagram rendered: ${b.filename}`, `${png.byteLength} bytes`);
				results.push({ block: b, png });
				// The public Kroki instance can throttle bursts; add a small delay between blocks.
				await delay(200);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				this.logger.warn(`Mermaid render failed; falling back to code block: ${b.filename}`, msg);
				results.push(null);
			}
		}
		return results;
	}

	private async renderWithRetry(source: string): Promise<ArrayBuffer> {
		let lastErr: unknown = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				return await this.renderOne(source);
			} catch (e) {
				lastErr = e;
				const msg = e instanceof Error ? e.message : String(e);
				// 429 rate limit / 5xx temporary server error → retry with backoff; throw immediately for other errors such as syntax errors
				if (!/\b(429|5\d{2})\b/.test(msg)) throw e;
				const backoff = 500 * Math.pow(2, attempt); // 500ms / 1s / 2s
				this.logger.warn(`Kroki is temporarily unavailable,${backoff}ms before retry (${attempt + 1}/3)`, msg);
				await delay(backoff);
			}
		}
		throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
	}

	private async renderOne(source: string): Promise<ArrayBuffer> {
		const res = await withTimeout(
			requestUrl({
				method: 'POST',
				url: this.serverUrl,
				contentType: 'text/plain; charset=utf-8',
				body: source,
				throw: false,
			}),
			RENDER_TIMEOUT_MS,
			`Kroki Mermaid render timed out after ${RENDER_TIMEOUT_MS}ms`,
		);
		if (res.status < 200 || res.status >= 300) {
			throw new Error(`kroki returned ${res.status}: ${(res.text ?? '').slice(0, 200)}`);
		}
		return res.arrayBuffer;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
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
