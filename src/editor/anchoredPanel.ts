const VIEWPORT_MARGIN = 6;
const PANEL_OFFSET = 4;

export interface AnchoredPanelOptions {
	/** Pass the toolbar bar itself, not the individual trigger button, so the panel always starts flush
	 * with the toolbar's left edge regardless of which button opened it. */
	anchor: HTMLElement;
	/** Builds the panel's DOM. Called once per `open()`. */
	build: () => HTMLElement;
	/** Fired once the panel has closed, for any reason (Escape, click-away, or a caller-driven close()). */
	onClose?: () => void;
}

/**
 * A small floating panel anchored under a trigger, portalled to `document.body` and positioned with
 * `position: fixed` in viewport coordinates so it's never clipped by CodeMirror's editor content
 * container. Measured off-screen first (`visibility: hidden` at 0,0 — still laid out, so
 * `offsetWidth/offsetHeight` are accurate) so its on-screen position can be computed from its real size
 * before it's ever visible.
 */
export class AnchoredPanel {
	private el: HTMLElement | null = null;
	private cleanup: Array<() => void> = [];

	isOpen(): boolean {
		return this.el !== null;
	}

	open(opts: AnchoredPanelOptions): void {
		if (this.el) return;

		const panel = opts.build();
		panel.addClass('confluence-image-anchored-panel', 'confluence-image-anchored-panel-measuring');
		document.body.appendChild(panel);
		this.el = panel;

		const reposition = (): void => this.place(opts.anchor, panel);
		reposition();
		panel.removeClass('confluence-image-anchored-panel-measuring');

		const onDocMouseDown = (evt: MouseEvent): void => {
			const target = evt.target as Node;
			if (!panel.contains(target) && !opts.anchor.contains(target)) this.close(opts.onClose);
		};
		const onKeyDown = (evt: KeyboardEvent): void => {
			if (evt.key === 'Escape') { evt.preventDefault(); this.close(opts.onClose); }
		};
		document.addEventListener('mousedown', onDocMouseDown, true);
		document.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);

		this.cleanup = [
			() => document.removeEventListener('mousedown', onDocMouseDown, true),
			() => document.removeEventListener('keydown', onKeyDown, true),
			() => window.removeEventListener('resize', reposition),
			() => window.removeEventListener('scroll', reposition, true),
		];
	}

	private place(anchor: HTMLElement, panel: HTMLElement): void {
		const a = anchor.getBoundingClientRect();
		const maxLeft = window.innerWidth - panel.offsetWidth - VIEWPORT_MARGIN;
		const maxTop = window.innerHeight - panel.offsetHeight - VIEWPORT_MARGIN;

		let top = a.bottom + PANEL_OFFSET;
		if (top + panel.offsetHeight > window.innerHeight - VIEWPORT_MARGIN) {
			const above = a.top - PANEL_OFFSET - panel.offsetHeight;
			if (above >= VIEWPORT_MARGIN) top = above;
		}

		panel.style.top = `${Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop))}px`;
		panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(a.left, maxLeft))}px`;
	}

	/** Closes the panel if open. Safe to call redundantly (e.g. from both a click-away and the owning
	 * widget's own teardown) — a second call while already closed is a no-op. */
	close(onClose?: () => void): void {
		if (!this.el) return;
		this.cleanup.forEach((fn) => fn());
		this.cleanup = [];
		this.el.remove();
		this.el = null;
		(onClose ?? (() => {}))();
	}
}
