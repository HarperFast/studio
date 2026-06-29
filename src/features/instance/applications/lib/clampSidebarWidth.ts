/** Narrowest the file tray may be dragged — below this the tree labels are unusable. */
export const MIN_SIDEBAR_WIDTH = 180;

/**
 * Clamp a desired sidebar width to a usable range: never narrower than
 * {@link MIN_SIDEBAR_WIDTH}, and never wider than half the viewport (so the editor
 * always keeps the larger share of the screen). `viewportWidth` is passed in rather
 * than read from `window` so this stays a pure, testable function.
 */
export function clampSidebarWidth(width: number, viewportWidth: number): number {
	const max = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth / 2));
	return Math.round(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), max));
}
