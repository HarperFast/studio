import { clampSidebarWidth } from '@/features/instance/applications/lib/clampSidebarWidth';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { cx } from 'class-variance-authority';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches the previous fixed `w-56` (224px) so existing layouts are unchanged on first load. */
export const DEFAULT_SIDEBAR_WIDTH = 224;

/**
 * Drag-to-resize state for the file tray. Mirrors the resizable chat panel
 * (see `Chat/FloatingChat.tsx`): mousedown arms the gesture, then window `mousemove`/`mouseup`
 * listeners track it so the cursor can leave the handle. The tray is anchored at `left: 0`, so
 * the new width is simply the clamped cursor X. `isResizing` lets the caller drop layout
 * transitions mid-drag (they'd otherwise lag the editor pane).
 *
 * While dragging we update only the transient `width` (one render per frame) and commit to
 * local storage once on release — writing localStorage on every `mousemove` would stutter.
 */
export function useResizableSidebar() {
	const [persistedWidth, setPersistedWidth] = useLocalStorage(
		LocalStorageKeys.ApplicationsSidebarWidth,
		DEFAULT_SIDEBAR_WIDTH,
	);
	const [isResizing, setIsResizing] = useState(false);
	const [width, setWidth] = useState(() => clampSidebarWidth(persistedWidth, window.innerWidth));
	const widthRef = useRef(width);
	widthRef.current = width;

	// When not actively dragging, keep the rendered width in sync with the persisted value
	// (e.g. after the resize handler below clamps it).
	useEffect(() => {
		if (!isResizing) {
			setWidth(clampSidebarWidth(persistedWidth, window.innerWidth));
		}
	}, [persistedWidth, isResizing]);

	// If the viewport shrank since the width was stored, pull it back into range.
	useEffect(() => {
		const onResize = () => setPersistedWidth(current => clampSidebarWidth(current, window.innerWidth));
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [setPersistedWidth]);

	const startResizing = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) {
			return;
		}
		const onMouseMove = (event: MouseEvent) => setWidth(clampSidebarWidth(event.clientX, window.innerWidth));
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

/** The visible drag affordance pinned to the tray's right edge. */
export function SidebarResizeHandle({
	isResizing,
	onMouseDown,
}: {
	isResizing: boolean;
	onMouseDown: (event: React.MouseEvent) => void;
}) {
	return (
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			onMouseDown={onMouseDown}
			className={cx(
				'absolute top-0 right-0 bottom-0 w-1 z-40 cursor-col-resize',
				'hover:bg-violet-400/60 dark:hover:bg-violet-500/60 transition-colors',
				isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
			)}
		/>
	);
}
