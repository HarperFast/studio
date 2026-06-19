import { describe, expect, it } from 'vitest';
import { centerOf, clampPosition, clampSize } from './useResizableDialog';

// These mirror the constants in useResizableDialog: MIN_WIDTH 360, MIN_HEIGHT 280, MARGIN 16.
const VW = 1280;
const VH = 800;

describe('clampSize', () => {
	it('passes a size that already fits through unchanged', () => {
		expect(clampSize({ width: 820, height: 680 }, VW, VH)).toEqual({ width: 820, height: 680 });
	});

	it('clamps below the usable minimum up to MIN_WIDTH/MIN_HEIGHT', () => {
		expect(clampSize({ width: 100, height: 50 }, VW, VH)).toEqual({ width: 360, height: 280 });
	});

	it('clamps a size larger than the viewport to the viewport minus a margin on each side', () => {
		// vw - 2*16 = 1248, vh - 2*16 = 768.
		expect(clampSize({ width: 5000, height: 5000 }, VW, VH)).toEqual({ width: 1248, height: 768 });
	});

	it('rounds fractional dimensions to whole pixels', () => {
		expect(clampSize({ width: 820.4, height: 680.6 }, VW, VH)).toEqual({ width: 820, height: 681 });
	});

	it('keeps the minimum even when the viewport is smaller than the minimum', () => {
		// A tiny viewport can't satisfy both constraints; the minimum wins so the modal stays usable.
		expect(clampSize({ width: 800, height: 600 }, 200, 150)).toEqual({ width: 360, height: 280 });
	});
});

describe('centerOf', () => {
	it('centers the modal within the viewport', () => {
		expect(centerOf({ width: 820, height: 680 }, VW, VH)).toEqual({ x: 230, y: 60 });
	});

	it('rounds the centered position to whole pixels', () => {
		// (1280 - 821) / 2 = 229.5 -> 230, (800 - 681) / 2 = 59.5 -> 60.
		expect(centerOf({ width: 821, height: 681 }, VW, VH)).toEqual({ x: 230, y: 60 });
	});

	it('produces a negative origin when the modal is larger than the viewport', () => {
		expect(centerOf({ width: 1480, height: 1000 }, VW, VH)).toEqual({ x: -100, y: -100 });
	});
});

describe('clampPosition', () => {
	const size = { width: 820, height: 680 };

	it('leaves an in-view position unchanged', () => {
		expect(clampPosition({ x: 230, y: 60 }, size, VW, VH)).toEqual({ x: 230, y: 60 });
	});

	it('pulls a position past the top-left edge back to the margin', () => {
		expect(clampPosition({ x: -100, y: -50 }, size, VW, VH)).toEqual({ x: 16, y: 16 });
	});

	it('pulls a position past the bottom-right edge back so the whole modal stays in view', () => {
		// maxX = vw - width - margin = 1280 - 820 - 16 = 444, maxY = 800 - 680 - 16 = 104.
		expect(clampPosition({ x: 9999, y: 9999 }, size, VW, VH)).toEqual({ x: 444, y: 104 });
	});

	it('pins a modal larger than the viewport to the top-left margin', () => {
		// When the modal can't fit, maxX/maxY collapse to MARGIN, so the modal anchors at (16, 16).
		const oversized = { width: 2000, height: 2000 };
		expect(clampPosition({ x: 500, y: 500 }, oversized, VW, VH)).toEqual({ x: 16, y: 16 });
	});
});
