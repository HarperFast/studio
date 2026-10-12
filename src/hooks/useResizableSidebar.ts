import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const KEYBOARD_STEP = 10;

export interface ResizableSidebarOptions {
	/** Users' saved widths live under this key, so renaming it resets every one of them. */
	storageKey: LocalStorageKeys;
	defaultWidth: number;
	minWidth: number;
	/** Written onto every element given `sidebarRef`. */
	cssVariable: `--${string}`;
}

interface Gesture {
	pointerId: number;
	target: Element;
	startX: number;
	startWidth: number;
	/** Null until the pointer moves; only this is ever saved, never a viewport re-clamp. */
	dragWidth: number | null;
	liveWidth: number;
}

/** Half the viewport, so the main pane keeps the larger share — but never below the minimum. */
export function maxSidebarWidth(minWidth: number, viewportWidth: number): number {
	return Math.max(minWidth, Math.floor(viewportWidth / 2));
}

export function clampSidebarWidth(
	width: number,
	viewportWidth: number,
	{ minWidth, defaultWidth }: Pick<ResizableSidebarOptions, 'minWidth' | 'defaultWidth'>,
): number {
	// The saved value is whatever JSON is under the key, so it can be a string or object; arithmetic on
	// that is NaN, which would render `NaNpx` and collapse the sidebar.
	const usable = Number.isFinite(width) ? width : defaultWidth;
	return Math.round(Math.min(Math.max(usable, minWidth), maxSidebarWidth(minWidth, viewportWidth)));
}

/**
 * Pointer and Arrow-key resizing for a sidebar whose width is a CSS custom property.
 *
 * The hook is the only writer of `cssVariable` — attach `sidebarRef` to every element that reads it
 * rather than setting it through `style` — and a drag writes it without rendering. Only a released drag
 * or a key press saves a width; a cancelled drag and a viewport resize never do, so shrinking the window
 * can't lose the user's preference.
 */
export function useResizableSidebar({ storageKey, defaultWidth, minWidth, cssVariable }: ResizableSidebarOptions) {
	const [persistedWidth, setPersistedWidth] = useLocalStorage(storageKey, defaultWidth);
	const persistedWidthRef = useRef(persistedWidth);
	useLayoutEffect(() => {
		persistedWidthRef.current = persistedWidth;
	}, [persistedWidth]);

	const bounds = useMemo(() => ({ minWidth, defaultWidth }), [minWidth, defaultWidth]);
	const clamp = useCallback((value: number) => clampSidebarWidth(value, window.innerWidth, bounds), [bounds]);

	const [width, setWidth] = useState(() => clamp(persistedWidth));
	const widthRef = useRef(width);
	// The next press or key can arrive before React renders, so the ref leads the state. This is the only
	// writer of both, which is what keeps them equal without writing the ref during render.
	const showWidth = useCallback((next: number) => {
		widthRef.current = next;
		setWidth(next);
	}, []);
	const [isResizing, setIsResizing] = useState(false);
	const gestureRef = useRef<Gesture | null>(null);
	const nodesRef = useRef(new Set<HTMLElement>());

	const paint = useCallback((value: number) => {
		const px = `${value}px`;
		for (const node of nodesRef.current) {
			node.style.setProperty(cssVariable, px);
		}
	}, [cssVariable]);

	const sidebarRef = useCallback((node: HTMLElement | null) => {
		if (!node) {
			return;
		}
		nodesRef.current.add(node);
		node.style.setProperty(cssVariable, `${gestureRef.current?.liveWidth ?? widthRef.current}px`);
		return () => {
			nodesRef.current.delete(node);
		};
	}, [cssVariable]);

	useLayoutEffect(() => paint(width), [paint, width]);

	useEffect(() => {
		const onResize = () => {
			const gesture = gestureRef.current;
			if (gesture) {
				gesture.liveWidth = clamp(gesture.dragWidth ?? persistedWidthRef.current);
				paint(gesture.liveWidth);
			} else {
				showWidth(clamp(persistedWidthRef.current));
			}
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [clamp, paint, showWidth]);

	const startResizing = useCallback((event: React.PointerEvent) => {
		if (event.button !== 0 || gestureRef.current) {
			return;
		}
		event.preventDefault();
		const target = event.currentTarget;
		gestureRef.current = {
			pointerId: event.pointerId,
			target,
			startX: event.clientX,
			startWidth: widthRef.current,
			dragWidth: null,
			liveWidth: widthRef.current,
		};
		try {
			// Capture keeps the moves and the release coming even over an iframe or outside the window.
			target.setPointerCapture?.(event.pointerId);
		} catch {
			// A pointer that is no longer active can't be captured; the window listeners still end the drag.
		}
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) {
			return;
		}
		const endGesture = (commit: boolean) => {
			const gesture = gestureRef.current;
			if (!gesture) {
				return;
			}
			gestureRef.current = null;
			if (gesture.target.hasPointerCapture?.(gesture.pointerId)) {
				gesture.target.releasePointerCapture(gesture.pointerId);
			}
			const saved = commit && gesture.dragWidth !== null && gesture.dragWidth !== gesture.startWidth
				? gesture.dragWidth
				: null;
			const next = clamp(saved ?? persistedWidthRef.current);
			paint(next);
			showWidth(next);
			if (saved !== null) {
				setPersistedWidth(saved);
			}
			setIsResizing(false);
		};
		const onPointerMove = (event: PointerEvent) => {
			const gesture = gestureRef.current;
			if (gesture?.pointerId === event.pointerId) {
				gesture.dragWidth = clamp(gesture.startWidth + (event.clientX - gesture.startX));
				gesture.liveWidth = gesture.dragWidth;
				paint(gesture.liveWidth);
			}
		};
		const onPointerUp = (event: PointerEvent) => {
			if (gestureRef.current?.pointerId === event.pointerId) {
				endGesture(true);
			}
		};
		const onPointerAbort = (event: PointerEvent) => {
			if (gestureRef.current?.pointerId === event.pointerId) {
				endGesture(false);
			}
		};
		const onBlur = () => endGesture(false);

		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerAbort);
		window.addEventListener('lostpointercapture', onPointerAbort);
		window.addEventListener('blur', onBlur);
		return () => {
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerAbort);
			window.removeEventListener('lostpointercapture', onPointerAbort);
			window.removeEventListener('blur', onBlur);
		};
	}, [isResizing, clamp, paint, showWidth, setPersistedWidth]);

	const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
		const step = event.key === 'ArrowLeft' ? -KEYBOARD_STEP : event.key === 'ArrowRight' ? KEYBOARD_STEP : 0;
		if (!step) {
			return;
		}
		event.preventDefault();
		const next = clamp(widthRef.current + step);
		if (next !== widthRef.current) {
			showWidth(next);
			setPersistedWidth(next);
		}
	}, [clamp, showWidth, setPersistedWidth]);

	return {
		width,
		minWidth,
		maxWidth: maxSidebarWidth(minWidth, window.innerWidth),
		isResizing,
		sidebarRef,
		startResizing,
		handleKeyDown,
	};
}
