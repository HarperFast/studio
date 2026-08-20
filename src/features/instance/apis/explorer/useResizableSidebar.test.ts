/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	clampWidth,
	DEFAULT_SIDEBAR_WIDTH,
	maxSidebarWidth,
	MIN_SIDEBAR_WIDTH,
	useResizableSidebar,
} from './useResizableSidebar';

function setViewportWidth(width: number) {
	(window as unknown as { innerWidth: number }).innerWidth = width;
}

afterEach(() => {
	localStorage.clear();
	setViewportWidth(1024); // jsdom default
});

describe('clampWidth', () => {
	it('raises a too-small width up to the minimum', () => {
		expect(clampWidth(50, 1024)).toBe(MIN_SIDEBAR_WIDTH);
	});
	it('caps a too-large width at half the viewport', () => {
		expect(clampWidth(9999, 1000)).toBe(500);
	});
	it('passes a mid-range width through, rounded', () => {
		expect(clampWidth(321.6, 1024)).toBe(322);
	});
	it('never lets the max fall below the minimum on a tiny viewport', () => {
		expect(maxSidebarWidth(100)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampWidth(10, 100)).toBe(MIN_SIDEBAR_WIDTH);
	});
	it('falls back to the default for non-finite input instead of returning NaN', () => {
		// A corrupted/legacy localStorage value (object, array, string) would otherwise poison the CSS
		// variable with `NaNpx` and collapse the sidebar to 0.
		expect(clampWidth(Number.NaN, 1024)).toBe(DEFAULT_SIDEBAR_WIDTH);
		expect(clampWidth(Number('nope'), 1024)).toBe(DEFAULT_SIDEBAR_WIDTH);
		expect(clampWidth(Infinity, 1024)).toBe(DEFAULT_SIDEBAR_WIDTH);
	});
});

describe('useResizableSidebar', () => {
	it('sizes the rendered width from the drag delta and persists it on release', () => {
		const { result } = renderHook(() => useResizableSidebar());
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH);

		act(() => {
			result.current.startResizing({ clientX: 300, preventDefault() {} } as unknown as ReactMouseEvent);
		});
		act(() => {
			window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
		});
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 100);

		act(() => {
			window.dispatchEvent(new MouseEvent('mouseup'));
		});
		// Persisted preference survives a remount.
		const { result: remounted } = renderHook(() => useResizableSidebar());
		expect(remounted.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 100);
	});

	it('re-clamps the rendered width on viewport resize without clobbering the saved preference', () => {
		const { result } = renderHook(() => useResizableSidebar());
		expect(result.current.width).toBe(320);

		// Shrink the window so 320 no longer fits (half of 500 is 250).
		act(() => {
			setViewportWidth(500);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(250);

		// Grow it back: the preferred 320 is restored (proving resize never overwrote it).
		act(() => {
			setViewportWidth(1024);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(320);
	});

	it('nudges the width in 10px steps with Arrow keys', () => {
		const { result } = renderHook(() => useResizableSidebar());
		act(() => {
			result.current.handleKeyDown({ key: 'ArrowRight', preventDefault() {} } as unknown as ReactKeyboardEvent);
		});
		expect(result.current.width).toBe(330);
		act(() => {
			result.current.handleKeyDown({ key: 'ArrowLeft', preventDefault() {} } as unknown as ReactKeyboardEvent);
		});
		expect(result.current.width).toBe(320);
	});
});
