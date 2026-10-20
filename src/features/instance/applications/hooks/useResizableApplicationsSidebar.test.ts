/** @vitest-environment jsdom */
import { clampSidebarWidth } from '@/hooks/useResizableSidebar';
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	APPLICATIONS_SIDEBAR,
	DEFAULT_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
	useResizableApplicationsSidebar,
} from './useResizableApplicationsSidebar';

function setViewportWidth(width: number) {
	(window as unknown as { innerWidth: number }).innerWidth = width;
}

afterEach(() => {
	localStorage.clear();
	setViewportWidth(1024); // jsdom default
});

describe('applications sidebar config', () => {
	it('keeps the storage key, default and minimum that saved widths depend on', () => {
		expect(APPLICATIONS_SIDEBAR.storageKey).toBe('ApplicationsSidebarWidth');
		expect(APPLICATIONS_SIDEBAR.defaultWidth).toBe(224);
		expect(APPLICATIONS_SIDEBAR.minWidth).toBe(180);
		expect(APPLICATIONS_SIDEBAR.cssVariable).toBe('--app-sidebar-width');
	});

	it('restores a width saved under that key', () => {
		localStorage.setItem('ApplicationsSidebarWidth', '410');
		const { result } = renderHook(() => useResizableApplicationsSidebar());
		expect(result.current.width).toBe(410);
	});
});

describe('clampSidebarWidth with the applications bounds', () => {
	it('floors at the minimum width', () => {
		expect(clampSidebarWidth(50, 1000, APPLICATIONS_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(0, 1000, APPLICATIONS_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(-100, 1000, APPLICATIONS_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});

	it('caps at half the viewport', () => {
		expect(clampSidebarWidth(900, 1000, APPLICATIONS_SIDEBAR)).toBe(500);
		expect(clampSidebarWidth(10_000, 1600, APPLICATIONS_SIDEBAR)).toBe(800);
	});

	it('leaves an in-range width untouched', () => {
		expect(clampSidebarWidth(300, 1000, APPLICATIONS_SIDEBAR)).toBe(300);
	});

	it('keeps the minimum usable even on a narrow viewport (min wins over the half-cap)', () => {
		// half of 200 is 100, below the minimum — the minimum takes precedence.
		expect(clampSidebarWidth(100, 200, APPLICATIONS_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
		expect(clampSidebarWidth(400, 200, APPLICATIONS_SIDEBAR)).toBe(MIN_SIDEBAR_WIDTH);
	});

	it('rounds to whole pixels', () => {
		expect(clampSidebarWidth(300.6, 1000, APPLICATIONS_SIDEBAR)).toBe(301);
	});
});

describe('useResizableApplicationsSidebar', () => {
	it('moves the tray edge by the drag distance and persists it on release', () => {
		const { result } = renderHook(() => useResizableApplicationsSidebar());
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH);

		// The handle is the tray's rightmost pixels, so a grab lands just inside the edge.
		act(() => {
			result.current.startResizing(
				{
					button: 0,
					pointerId: 1,
					clientX: 222,
					currentTarget: document.createElement('div'),
					preventDefault() {},
				} as unknown as ReactPointerEvent,
			);
		});
		act(() => {
			window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 302 }));
		});
		act(() => {
			window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
		});
		expect(result.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 80);

		const { result: remounted } = renderHook(() => useResizableApplicationsSidebar());
		expect(remounted.current.width).toBe(DEFAULT_SIDEBAR_WIDTH + 80);
	});

	it('restores the saved width when the window grows back after shrinking', () => {
		localStorage.setItem('ApplicationsSidebarWidth', '400');
		const { result } = renderHook(() => useResizableApplicationsSidebar());
		act(() => {
			setViewportWidth(500);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(250);
		expect(localStorage.getItem('ApplicationsSidebarWidth')).toBe('400');

		act(() => {
			setViewportWidth(1024);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(400);
	});
});
