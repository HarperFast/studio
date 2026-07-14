import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Roughly the old fixed `lg:col-span-3` feel, so first load is close to unchanged. */
export const DEFAULT_DATABASES_SIDEBAR_WIDTH = 320;
/** Narrowest the sidebar may be dragged — below this the tree labels are unusable. */
const MIN_SIDEBAR_WIDTH = 200;

/** Clamp to a usable range: never below the minimum, never past half the viewport. */
function clampWidth(width: number, viewportWidth: number): number {
	const max = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth / 2));
	return Math.round(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), max));
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

	// If the viewport shrank since the width was stored, pull it back into range.
	useEffect(() => {
		const onResize = () => setPersistedWidth((current) => clampWidth(current, window.innerWidth));
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [setPersistedWidth]);

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

	return { width, isResizing, startResizing };
}
