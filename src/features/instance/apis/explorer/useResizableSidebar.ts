import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches the previous fixed `lg:w-80` (320px), so first load looks unchanged. */
export const DEFAULT_SIDEBAR_WIDTH = 320;
/**
 * Narrowest the sidebar may be dragged. A touch wider than the databases sidebar's 200px because the
 * endpoint tree nests deeper (resource → path → method, each level indented), so labels need the room.
 */
export const MIN_SIDEBAR_WIDTH = 240;
/** Width nudge per Arrow key press when the separator is focused. */
const KEYBOARD_STEP = 10;

/** Widest the sidebar may be — half the viewport, so the detail pane keeps the larger share. */
export function maxSidebarWidth(viewportWidth: number): number {
	return Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth / 2));
}

/** Clamp to a usable range: never below the minimum, never past half the viewport. */
export function clampWidth(width: number, viewportWidth: number): number {
	// A corrupted/legacy value under this key (safeParse returns any valid JSON, so an object, array, or
	// string reaches us here) would make the arithmetic NaN and render `--api-sidebar-width: NaNpx`,
	// silently collapsing the sidebar to 0. Fall back to the default rather than propagate NaN.
	const usable = Number.isFinite(width) ? width : DEFAULT_SIDEBAR_WIDTH;
	return Math.round(Math.min(Math.max(usable, MIN_SIDEBAR_WIDTH), maxSidebarWidth(viewportWidth)));
}

/**
 * Drag-to-resize state for the API explorer's endpoint sidebar. Mirrors the databases sidebar
 * (see `databases/hooks/useResizableDatabasesSidebar.ts`): mousedown arms the gesture, then window
 * `mousemove`/`mouseup` listeners track it so the cursor can leave the handle. Like that sidebar (and
 * unlike the applications file tray, which is anchored at the viewport's left edge so its width is just
 * the cursor X), this one sits in-flow with page padding to its left, so we track the delta from where
 * the drag started.
 *
 * Width updates once per render during the drag and commits to local storage once on release — writing
 * localStorage on every `mousemove` would stutter. The width is a global UI preference, not per-entity:
 * unlike the server/auth settings it carries no credential, so it's fine to share across instances.
 */
export function useResizableSidebar() {
	const [persistedWidth, setPersistedWidth] = useLocalStorage(
		LocalStorageKeys.ApiExplorerSidebarWidth,
		DEFAULT_SIDEBAR_WIDTH,
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
