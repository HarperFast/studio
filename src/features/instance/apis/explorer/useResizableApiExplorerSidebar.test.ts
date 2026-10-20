/** @vitest-environment jsdom */
import { clampSidebarWidth, maxSidebarWidth } from '@/hooks/useResizableSidebar';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	API_EXPLORER_SIDEBAR,
	DEFAULT_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	useResizableApiExplorerSidebar,
} from './useResizableApiExplorerSidebar';

function setViewportWidth(width: number) {
	(window as unknown as { innerWidth: number }).innerWidth = width;
}

afterEach(() => {
	localStorage.clear();
	setViewportWidth(1024); // jsdom default
});

describe('API explorer sidebar config', () => {
	it('keeps the storage key, default and minimum that saved widths depend on', () => {
		expect(API_EXPLORER_SIDEBAR.storageKey).toBe('ApiExplorerSidebarWidth');
		expect(API_EXPLORER_SIDEBAR.defaultWidth).toBe(320);
		expect(API_EXPLORER_SIDEBAR.minWidth).toBe(240);
		expect(API_EXPLORER_SIDEBAR.cssVariable).toBe('--api-sidebar-width');
	});

	it('restores a width saved under that key', () => {
		localStorage.setItem('ApiExplorerSidebarWidth', '410');
		const { result } = renderHook(() => useResizableApiExplorerSidebar());
		expect(result.current.width).toBe(410);
	});
});

describe('clampSidebarWidth with the API explorer bounds', () => {
	it('raises a too-small width up to the minimum', () => {
		expect(clampSidebarWidth(50, 1024, API_EXPLORER_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});
	it('caps a too-large width at half the viewport', () => {
		expect(clampSidebarWidth(9999, 1000, API_EXPLORER_SIDEBAR)).toBe(500);
	});
	it('passes a mid-range width through, rounded', () => {
		expect(clampSidebarWidth(321.6, 1024, API_EXPLORER_SIDEBAR)).toBe(322);
	});
	it('never lets the max fall below the minimum on a tiny viewport', () => {
		expect(maxSidebarWidth(MIN_SIDEBAR_WIDTH, 100)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(10, 100, API_EXPLORER_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});
	it('falls back to the default for non-finite input instead of returning NaN', () => {
		// A corrupted/legacy localStorage value (object, array, string) would otherwise poison the CSS
		// variable with `NaNpx` and collapse the sidebar to 0.
		expect(clampSidebarWidth(Number.NaN, 1024, API_EXPLORER_SIDEBAR)).toBe(DEFAULT_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(Number('nope'), 1024, API_EXPLORER_SIDEBAR)).toBe(DEFAULT_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(Infinity, 1024, API_EXPLORER_SIDEBAR)).toBe(DEFAULT_SIDEBAR_WIDTH);
	});
});

describe('useResizableApiExplorerSidebar', () => {
	it('sizes the rendered width from the drag delta and persists it on release', () => {
		const { result } = renderHook(() => useResizableApiExplorerSidebar());
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH);

		act(() => {
			result.current.startResizing(
				{
					button: 0,
					pointerId: 1,
					clientX: 300,
					currentTarget: document.createElement('div'),
					preventDefault() {},
				} as unknown as ReactPointerEvent,
			);
		});
		act(() => {
			window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 400 }));
		});
		act(() => {
			window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
		});
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 100);

		// Persisted preference survives a remount.
		const { result: remounted } = renderHook(() => useResizableApiExplorerSidebar());
		expect(remounted.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 100);
	});

	it('re-clamps the rendered width on viewport resize without clobbering the saved preference', () => {
		const { result } = renderHook(() => useResizableApiExplorerSidebar());
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
		const { result } = renderHook(() => useResizableApiExplorerSidebar());
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
