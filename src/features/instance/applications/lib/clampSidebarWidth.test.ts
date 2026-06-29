import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, MIN_SIDEBAR_WIDTH } from './clampSidebarWidth';

describe('clampSidebarWidth', () => {
	it('floors at the minimum width', () => {
		expect(clampSidebarWidth(50, 1000)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(0, 1000)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(-100, 1000)).toBe(MIN_SIDEBAR_WIDTH);
	});

	it('caps at half the viewport', () => {
		expect(clampSidebarWidth(900, 1000)).toBe(500);
		expect(clampSidebarWidth(10_000, 1600)).toBe(800);
	});

	it('leaves an in-range width untouched', () => {
		expect(clampSidebarWidth(300, 1000)).toBe(300);
	});

	it('keeps the minimum usable even on a narrow viewport (min wins over the half-cap)', () => {
		// half of 200 is 100, below the minimum — the minimum takes precedence.
		expect(clampSidebarWidth(100, 200)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(400, 200)).toBe(MIN_SIDEBAR_WIDTH);
	});

	it('rounds to whole pixels', () => {
		expect(clampSidebarWidth(300.6, 1000)).toBe(301);
	});
});
