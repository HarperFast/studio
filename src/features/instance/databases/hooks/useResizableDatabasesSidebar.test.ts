/** @vitest-environment jsdom */
import { clampSidebarWidth, maxSidebarWidth } from '@/hooks/useResizableSidebar';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	DATABASES_SIDEBAR,
	DEFAULT_DATABASES_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	useResizableDatabasesSidebar,
} from './useResizableDatabasesSidebar';

function setViewportWidth(width: number) {
	(window as unknown as { innerWidth: number }).innerWidth = width;
}

afterEach(() => {
	localStorage.clear();
	setViewportWidth(1024); // jsdom default
});

describe('databases sidebar config', () => {
	it('keeps the storage key, default and minimum that saved widths depend on', () => {
		expect(DATABASES_SIDEBAR.storageKey).toBe('DatabasesSidebarWidth');
		expect(DATABASES_SIDEBAR.defaultWidth).toBe(320);
		expect(DATABASES_SIDEBAR.minWidth).toBe(200);
		expect(DATABASES_SIDEBAR.cssVariable).toBe('--db-sidebar-width');
	});

	it('restores a width saved under that key', () => {
		localStorage.setItem('DatabasesSidebarWidth', '410');
		const { result } = renderHook(() => useResizableDatabasesSidebar());
		expect(result.current.width).toBe(410);
	});
});

describe('clampSidebarWidth with the databases bounds', () => {
	it('raises a too-small width up to the minimum', () => {
		expect(clampSidebarWidth(50, 1024, DATABASES_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});
	it('caps a too-large width at half the viewport', () => {
		expect(clampSidebarWidth(9999, 1000, DATABASES_SIDEBAR)).toBe(500);
	});
	it('passes a mid-range width through, rounded', () => {
		expect(clampSidebarWidth(321.6, 1024, DATABASES_SIDEBAR)).toBe(322);
	});
	it('never lets the max fall below the minimum on a tiny viewport', () => {
		expect(maxSidebarWidth(MIN_SIDEBAR_WIDTH, 100)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(10, 100, DATABASES_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});
});

describe('useResizableDatabasesSidebar', () => {
	it('sizes the rendered width from the drag delta and persists it on release', () => {
		const { result } = renderHook(() => useResizableDatabasesSidebar());
		expect(result.current.width).toBe(DEFAULT_DATABASES_SIDEBAR_WIDTH);

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
		expect(result.current.width).toBe(DEFAULT_DATABASES_SIDEBAR_WIDTH + 100);

		// Persisted preference survives a remount.
		const { result: remounted } = renderHook(() => useResizableDatabasesSidebar());
		expect(remounted.current.width).toBe(DEFAULT_DATABASES_SIDEBAR_WIDTH + 100);
	});

	it('re-clamps the rendered width on viewport resize without clobbering the saved preference', () => {
		const { result } = renderHook(() => useResizableDatabasesSidebar());
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
		const { result } = renderHook(() => useResizableDatabasesSidebar());
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
