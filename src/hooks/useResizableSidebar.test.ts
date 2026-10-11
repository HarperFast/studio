/** @vitest-environment jsdom */
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clampSidebarWidth,
	maxSidebarWidth,
	type ResizableSidebarOptions,
	useResizableSidebar,
} from './useResizableSidebar';

const OPTIONS: ResizableSidebarOptions = {
	storageKey: LocalStorageKeys.DatabasesSidebarWidth,
	defaultWidth: 300,
	minWidth: 200,
	cssVariable: '--test-sidebar-width',
};
const VAR = OPTIONS.cssVariable;

type Hook = { current: ReturnType<typeof useResizableSidebar> };

function setViewportWidth(width: number) {
	(window as unknown as { innerWidth: number }).innerWidth = width;
}

function savedWidth() {
	const raw = localStorage.getItem(OPTIONS.storageKey);
	return raw === null ? null : JSON.parse(raw);
}

function renderSidebar() {
	let renders = 0;
	const hook = renderHook(() => {
		renders++;
		return useResizableSidebar(OPTIONS);
	});
	const node = document.createElement('div');
	let detach: (() => void) | void;
	act(() => {
		detach = hook.result.current.sidebarRef(node);
	});
	return { ...hook, node, renders: () => renders, detach: () => detach?.() };
}

function pointerDown(
	result: Hook,
	{ clientX, button = 0, pointerId = 1, target = document.createElement('div') }: {
		clientX: number;
		button?: number;
		pointerId?: number;
		target?: Element;
	},
) {
	const preventDefault = vi.fn();
	act(() => {
		result.current.startResizing(
			{ button, clientX, pointerId, currentTarget: target, preventDefault } as unknown as ReactPointerEvent,
		);
	});
	return preventDefault;
}

function dispatch(type: string, init: PointerEventInit = {}) {
	act(() => {
		window.dispatchEvent(new PointerEvent(type, { pointerId: 1, ...init }));
	});
}

function press(result: Hook, key: string) {
	const preventDefault = vi.fn();
	act(() => {
		result.current.handleKeyDown({ key, preventDefault } as unknown as ReactKeyboardEvent);
	});
	return preventDefault;
}

afterEach(() => {
	localStorage.clear();
	setViewportWidth(1024); // jsdom default
	document.body.style.userSelect = '';
});

describe('clampSidebarWidth', () => {
	it('raises a too-small width to the minimum', () => {
		expect(clampSidebarWidth(50, 1024, OPTIONS)).toBe(200);
		expect(clampSidebarWidth(-100, 1024, OPTIONS)).toBe(200);
	});
	it('caps a too-large width at half the viewport', () => {
		expect(clampSidebarWidth(9999, 1000, OPTIONS)).toBe(500);
	});
	it('passes a mid-range width through, rounded to whole pixels', () => {
		expect(clampSidebarWidth(321.6, 1024, OPTIONS)).toBe(322);
	});
	it('never lets the max fall below the minimum on a tiny viewport', () => {
		expect(maxSidebarWidth(200, 100)).toBe(200);
		expect(clampSidebarWidth(400, 100, OPTIONS)).toBe(200);
	});
	it('falls back to the default for a non-finite value instead of returning NaN', () => {
		expect(clampSidebarWidth(Number.NaN, 1024, OPTIONS)).toBe(300);
		expect(clampSidebarWidth(Number('nope'), 1024, OPTIONS)).toBe(300);
		expect(clampSidebarWidth(Infinity, 1024, OPTIONS)).toBe(300);
		expect(clampSidebarWidth({} as unknown as number, 1024, OPTIONS)).toBe(300);
	});
	it('still clamps the fallback default', () => {
		expect(clampSidebarWidth(Number.NaN, 400, OPTIONS)).toBe(200);
	});
});

describe('useResizableSidebar', () => {
	it('starts at the default and writes it to an attached element', () => {
		const { result, node } = renderSidebar();
		expect(result.current.width).toBe(300);
		expect(result.current.minWidth).toBe(200);
		expect(result.current.maxWidth).toBe(512);
		expect(node.style.getPropertyValue(VAR)).toBe('300px');
	});

	it('reads a saved width back from its storage key', () => {
		localStorage.setItem(OPTIONS.storageKey, '410');
		const { result, node } = renderSidebar();
		expect(result.current.width).toBe(410);
		expect(node.style.getPropertyValue(VAR)).toBe('410px');
	});

	it('moves the CSS variable from the drag delta without rendering, then commits and saves on release', () => {
		const { result, node, renders } = renderSidebar();
		const preventDefault = pointerDown(result, { clientX: 300 });
		expect(preventDefault).toHaveBeenCalled();
		expect(result.current.isResizing).toBe(true);
		expect(document.body.style.userSelect).toBe('none');
		const rendersAtStart = renders();

		dispatch('pointermove', { clientX: 350 });
		dispatch('pointermove', { clientX: 400 });
		expect(node.style.getPropertyValue(VAR)).toBe('400px');
		expect(renders()).toBe(rendersAtStart);
		expect(result.current.width).toBe(300);
		expect(savedWidth()).toBe(300);

		dispatch('pointerup', { clientX: 400 });
		expect(result.current.isResizing).toBe(false);
		expect(result.current.width).toBe(400);
		expect(node.style.getPropertyValue(VAR)).toBe('400px');
		expect(savedWidth()).toBe(400);
		expect(document.body.style.userSelect).toBe('');
	});

	it('starts a drag grabbed again before React renders from the width just released', () => {
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 400 });
		act(() => {
			window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
			result.current.startResizing(
				{
					button: 0,
					clientX: 400,
					pointerId: 2,
					currentTarget: document.createElement('div'),
					preventDefault() {},
				} as unknown as ReactPointerEvent,
			);
		});
		dispatch('pointermove', { clientX: 450, pointerId: 2 });
		expect(node.style.getPropertyValue(VAR)).toBe('450px');
		dispatch('pointerup', { pointerId: 2 });
		expect(savedWidth()).toBe(450);
	});

	it('clamps the live width while dragging', () => {
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 0 });
		expect(node.style.getPropertyValue(VAR)).toBe('200px');
		dispatch('pointermove', { clientX: 5000 });
		expect(node.style.getPropertyValue(VAR)).toBe('512px');
		dispatch('pointerup');
		expect(savedWidth()).toBe(512);
	});

	it.each(['pointercancel', 'lostpointercapture', 'blur'])(
		'%s ends the drag and puts the saved width back without saving',
		(type) => {
			localStorage.setItem(OPTIONS.storageKey, '350');
			const { result, node } = renderSidebar();
			pointerDown(result, { clientX: 300 });
			dispatch('pointermove', { clientX: 420 });
			expect(node.style.getPropertyValue(VAR)).toBe('470px');

			if (type === 'blur') {
				act(() => {
					window.dispatchEvent(new Event('blur'));
				});
			} else {
				dispatch(type);
			}
			expect(result.current.isResizing).toBe(false);
			expect(document.body.style.userSelect).toBe('');
			expect(result.current.width).toBe(350);
			expect(node.style.getPropertyValue(VAR)).toBe('350px');
			expect(savedWidth()).toBe(350);

			// The gesture is over: later pointer events move nothing.
			dispatch('pointermove', { clientX: 600 });
			expect(node.style.getPropertyValue(VAR)).toBe('350px');
		},
	);

	it('ignores a pointerup that arrives after the release', () => {
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 360 });
		dispatch('pointerup');
		dispatch('lostpointercapture');
		expect(result.current.width).toBe(360);
		expect(node.style.getPropertyValue(VAR)).toBe('360px');
		expect(savedWidth()).toBe(360);
	});

	it('only follows the pointer that started the drag', () => {
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300, pointerId: 1 });
		// A second pointer can neither start a new drag nor move or end this one.
		pointerDown(result, { clientX: 100, pointerId: 2 });
		dispatch('pointermove', { clientX: 900, pointerId: 2 });
		dispatch('pointerup', { pointerId: 2 });
		dispatch('pointercancel', { pointerId: 2 });
		expect(result.current.isResizing).toBe(true);
		expect(node.style.getPropertyValue(VAR)).toBe('300px');

		dispatch('pointermove', { clientX: 340, pointerId: 1 });
		dispatch('pointerup', { pointerId: 1 });
		expect(result.current.width).toBe(340);
		expect(savedWidth()).toBe(340);
	});

	it('does not start a drag from a non-primary button', () => {
		const { result } = renderSidebar();
		const preventDefault = pointerDown(result, { clientX: 300, button: 2 });
		expect(preventDefault).not.toHaveBeenCalled();
		expect(result.current.isResizing).toBe(false);
		expect(document.body.style.userSelect).toBe('');
	});

	it('captures the pointer on the handle and releases it when the drag ends', () => {
		const { result } = renderSidebar();
		let captured: number | null = null;
		const target = document.createElement('div');
		Object.assign(target, {
			setPointerCapture: vi.fn((id: number) => (captured = id)),
			hasPointerCapture: (id: number) => captured === id,
			releasePointerCapture: vi.fn(() => (captured = null)),
		});
		pointerDown(result, { clientX: 300, pointerId: 7, target });
		expect(target.setPointerCapture).toHaveBeenCalledWith(7);
		dispatch('pointerup', { pointerId: 7 });
		expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
	});

	it('still drags when the pointer cannot be captured', () => {
		const { result, node } = renderSidebar();
		const target = document.createElement('div');
		Object.assign(target, {
			setPointerCapture: () => {
				throw new DOMException('No active pointer with the given id is found.', 'NotFoundError');
			},
		});
		pointerDown(result, { clientX: 300, target });
		dispatch('pointermove', { clientX: 330 });
		dispatch('pointerup');
		expect(node.style.getPropertyValue(VAR)).toBe('330px');
		expect(savedWidth()).toBe(330);
	});

	it('does not save a click, or a drag that ends at the width it started from', () => {
		localStorage.setItem(OPTIONS.storageKey, '700');
		const { result } = renderSidebar();
		expect(result.current.width).toBe(512);
		pointerDown(result, { clientX: 300 });
		dispatch('pointerup');
		expect(savedWidth()).toBe(700);

		// Pushing past the half-viewport cap leaves the width where it started.
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 400 });
		dispatch('pointerup');
		expect(result.current.width).toBe(512);
		expect(savedWidth()).toBe(700);
	});

	it('writes the variable to every attached element and stops writing to a detached one', () => {
		const { result, node, detach } = renderSidebar();
		const second = document.createElement('div');
		act(() => {
			result.current.sidebarRef(second);
		});
		expect(second.style.getPropertyValue(VAR)).toBe('300px');

		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 320 });
		expect(node.style.getPropertyValue(VAR)).toBe('320px');
		expect(second.style.getPropertyValue(VAR)).toBe('320px');

		detach();
		dispatch('pointermove', { clientX: 340 });
		expect(node.style.getPropertyValue(VAR)).toBe('320px');
		expect(second.style.getPropertyValue(VAR)).toBe('340px');

		// An element attached mid-drag starts at the live width, not the committed one.
		const late = document.createElement('div');
		act(() => {
			result.current.sidebarRef(late);
		});
		expect(late.style.getPropertyValue(VAR)).toBe('340px');
	});

	it('re-clamps the shown width on viewport resize without overwriting the saved preference', () => {
		const { result, node } = renderSidebar();
		act(() => {
			setViewportWidth(500);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(250);
		expect(node.style.getPropertyValue(VAR)).toBe('250px');
		expect(savedWidth()).toBe(300);

		act(() => {
			setViewportWidth(1024);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(300);
		expect(node.style.getPropertyValue(VAR)).toBe('300px');
	});

	it('re-clamps a live drag when the viewport shrinks before release', () => {
		setViewportWidth(1200);
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 550 });
		expect(node.style.getPropertyValue(VAR)).toBe('550px');

		act(() => {
			setViewportWidth(600);
			window.dispatchEvent(new Event('resize'));
		});
		expect(node.style.getPropertyValue(VAR)).toBe('300px');
		dispatch('pointerup');
		expect(result.current.width).toBe(300);
		expect(result.current.maxWidth).toBe(300);
		// What the pointer asked for is saved, so the width comes back once there is room again.
		expect(savedWidth()).toBe(550);
		act(() => {
			setViewportWidth(1200);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(550);
	});

	it('saves nothing when only the viewport changed while the handle was held', () => {
		localStorage.setItem(OPTIONS.storageKey, '400');
		const { result, node } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		act(() => {
			setViewportWidth(500);
			window.dispatchEvent(new Event('resize'));
		});
		expect(node.style.getPropertyValue(VAR)).toBe('250px');
		dispatch('pointerup');
		expect(result.current.width).toBe(250);
		expect(savedWidth()).toBe(400);

		act(() => {
			setViewportWidth(1024);
			window.dispatchEvent(new Event('resize'));
		});
		expect(result.current.width).toBe(400);
	});

	it('nudges the width in 10px steps with Arrow keys and saves it', () => {
		const { result, node } = renderSidebar();
		expect(press(result, 'ArrowRight')).toHaveBeenCalled();
		expect(result.current.width).toBe(310);
		expect(node.style.getPropertyValue(VAR)).toBe('310px');
		expect(savedWidth()).toBe(310);
		press(result, 'ArrowLeft');
		press(result, 'ArrowLeft');
		expect(result.current.width).toBe(290);
		expect(savedWidth()).toBe(290);
		expect(press(result, 'Enter')).not.toHaveBeenCalled();
		expect(result.current.width).toBe(290);
	});

	it('applies every auto-repeated key press even when two arrive before a render', () => {
		const { result } = renderSidebar();
		act(() => {
			const event = { key: 'ArrowRight', preventDefault() {} } as unknown as ReactKeyboardEvent;
			result.current.handleKeyDown(event);
			result.current.handleKeyDown(event);
		});
		expect(result.current.width).toBe(320);
		expect(savedWidth()).toBe(320);
	});

	it('steps from the width on screen, not from a saved width the viewport is clamping', () => {
		localStorage.setItem(OPTIONS.storageKey, '700');
		const { result } = renderSidebar();
		expect(result.current.width).toBe(512);
		press(result, 'ArrowLeft');
		expect(result.current.width).toBe(502);
		expect(savedWidth()).toBe(502);
	});

	it('leaves the saved width alone when a key press cannot move the sidebar', () => {
		localStorage.setItem(OPTIONS.storageKey, '700');
		const { result } = renderSidebar();
		press(result, 'ArrowRight');
		expect(result.current.width).toBe(512);
		expect(savedWidth()).toBe(700);
	});

	it('cleans up a drag that is still live when the sidebar unmounts', () => {
		const removeListener = vi.spyOn(window, 'removeEventListener');
		const { result, unmount } = renderSidebar();
		pointerDown(result, { clientX: 300 });
		dispatch('pointermove', { clientX: 380 });
		unmount();
		expect(document.body.style.userSelect).toBe('');
		for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
			expect(removeListener).toHaveBeenCalledWith(type, expect.any(Function));
		}
		expect(savedWidth()).toBe(300);
		removeListener.mockRestore();
	});
});
