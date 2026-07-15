import { toBlob } from 'html-to-image';

/** Resolves the on-screen background color of `el`, walking up the tree
 *  until a non-transparent ancestor is found (Card surfaces are
 *  rgba(0,0,0,0) by default — falling through to a literal white would
 *  produce white-bg PNGs in dark mode). */
function resolveBackground(el: HTMLElement): string {
	let cur: HTMLElement | null = el;
	while (cur) {
		const bg = getComputedStyle(cur).backgroundColor;
		if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { return bg; }
		cur = cur.parentElement;
	}
	// Fall back to the document body's resolved background, which respects
	// the active theme via Tailwind tokens.
	const bodyBg = typeof document !== 'undefined' ? getComputedStyle(document.body).backgroundColor : '';
	if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)') { return bodyBg; }
	return '#ffffff';
}

/** Default pixel ratio for chart exports. 3× yields ~9 megapixels for an
 *  800×1000 panel — enough for slide decks and incident reports without
 *  blowing up clipboard payloads. The expanded-view export inherits the
 *  same ratio applied against a much larger DOM, so its output is
 *  proportionally bigger. */
export const DEFAULT_EXPORT_PIXEL_RATIO = 3;

/** Converts a chart's DOM subtree to a PNG blob. backgroundColor walks
 *  ancestors so dark-mode Card surfaces capture as dark, not white. */
export async function captureChartAsBlob(
	chartContainer: HTMLElement,
	pixelRatio: number = DEFAULT_EXPORT_PIXEL_RATIO,
): Promise<Blob> {
	const blob = await toBlob(chartContainer, {
		pixelRatio,
		backgroundColor: resolveBackground(chartContainer),
	});
	if (!blob) { throw new Error('Failed to capture chart as image'); }
	return blob;
}

/** Trigger a browser download of `blob` as `filename` via a transient anchor.
 *  Shared by the PNG export and the CSV export so they can't drift. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	// Revoke on a later tick: some browsers (Firefox) start the download
	// asynchronously, and a synchronous revoke can abort it.
	window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadChart(chartContainer: HTMLElement, filename: string): Promise<void> {
	const blob = await captureChartAsBlob(chartContainer);
	triggerBlobDownload(blob, filename);
}

/** Capture the chart and write it to the clipboard as a PNG ClipboardItem.
 *  Resolves to `true` on success, `false` if either the capture failed or
 *  the browser denied clipboard access (Safari + non-secure contexts are
 *  the common offenders). The caller decides UX — typically a toast. */
export async function copyChartToClipboard(chartContainer: HTMLElement): Promise<boolean> {
	if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
		return false;
	}
	try {
		const blob = await captureChartAsBlob(chartContainer);
		await navigator.clipboard.write([
			new ClipboardItem({ 'image/png': blob }),
		]);
		return true;
	} catch {
		return false;
	}
}

/** Slugify a metric/title for use in a download filename. */
export function slugifyForFilename(prefix: string): string {
	return prefix.replace(/[^a-z0-9-]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
}

/** ISO-8601 timestamp with filename-hostile characters (`:` `.`) dashed. */
export function filenameTimestamp(ms: number): string {
	return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** Slugify a metric/title for use as a download filename. */
export function makeExportFilename(prefix: string, range: { startTime: number; endTime: number }): string {
	return `${slugifyForFilename(prefix)}-${filenameTimestamp(range.endTime)}.png`;
}
