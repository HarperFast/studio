import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Roughly the old fixed `lg:col-span-3` feel, so first load is close to unchanged. */
export const DEFAULT_DATABASES_SIDEBAR_WIDTH = 320;
/** Narrowest the sidebar may be dragged — below this the tree labels are unusable. */
export const MIN_SIDEBAR_WIDTH = 200;
/** Width nudge per Arrow key press when the separator is focused. */
const KEYBOARD_STEP = 10;

/** Widest the sidebar may be — half the viewport, so the content pane keeps the larger share. */
export function maxSidebarWidth(viewportWidth: number): number {
	return Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth / 2));
}

/** Clamp to a usable range: never below the minimum, never past half the viewport. */
export function clampWidth(width: number, viewportWidth: number): number {
	return Math.round(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), maxSidebarWidth(viewportWidth)));
}

/**
 * Drag-to-resize state for the databases sidebar. Mirrors the applications file tray
 * (see `ApplicationsSidebar/SidebarResizeHandle.tsx`): mousedown arms the gesture, then window
 * `mousemove`/`mouseup` listeners track it so the cursor can leave the handle. Unlike that tray
 * (anchored at the viewport's left edge, so its width is just the cursor X), this sidebar sits
 * in-flow with page padding to its left, so we track the delta from where the drag started.
 *
 * Width updates once per render during the drag and commits to local storage once on release —
 * writing localStorage on every `mousemove` would stutter.
 */
export function useResizableDatabasesSidebar() {
	const [persistedWidth, setPersistedWidth] = useLocalStorage(
		LocalStorageKeys.DatabasesSidebarWidth,
		DEFAULT_DATABASES_SIDEBAR_WIDTH,
	);
	const [isResizing, setIsResizing] = useState(false);
	const [width, setWidth] = useState(() => clampWidth(persistedWidth, window.innerWidth));
	const widthRef = useRef(width);
	widthRef.current = width;
	// The cursor X and sidebar width captured at mousedown, so mousemove can size from the delta.
	const gestureRef = useRef<{ startX: number; startWidth: number } | null>(null);

	// When not actively dragging, keep the rendered width in sync with the persisted value
	// (e.g. after a viewport-resize clamp below).
	useEffect(() => {
		if (!isResizing) {
			setWidth(clampWidth(persistedWidth, window.innerWidth));
		}
	}, [persistedWidth, isResizing]);

	// On viewport resize, re-clamp only the *rendered* width — never the persisted preference. Writing
	// localStorage on every resize event stutters, and clamping the stored value down would permanently
	// lose the user's preferred width once they shrink then re-widen the window.
	useEffect(() => {
		const onResize = () => {
			if (!isResizing) {
				setWidth(clampWidth(persistedWidth, window.innerWidth));
			}
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [persistedWidth, isResizing]);

	const startResizing = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		gestureRef.current = { startX: event.clientX, startWidth: widthRef.current };
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) {
			return;
		}
		const onMouseMove = (event: MouseEvent) => {
			const gesture = gestureRef.current;
			if (!gesture) {
				return;
			}
			setWidth(clampWidth(gesture.startWidth + (event.clientX - gesture.startX), window.innerWidth));
		};
		const onMouseUp = () => {
			setIsResizing(false);
			// Persist the final width once, instead of on every mousemove.
			setPersistedWidth(widthRef.current);
		};
		// Suppress text selection across the page while dragging.
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		return () => {
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		};
	}, [isResizing, setPersistedWidth]);

	// Keyboard resize for the focused separator: Arrow keys nudge the persisted width in fixed steps.
	const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			setPersistedWidth((current) => clampWidth(current - KEYBOARD_STEP, window.innerWidth));
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			setPersistedWidth((current) => clampWidth(current + KEYBOARD_STEP, window.innerWidth));
		}
	}, [setPersistedWidth]);

	return { width, isResizing, startResizing, handleKeyDown };
}
