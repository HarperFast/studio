import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface DialogSize {
	width: number;
	height: number;
}

export interface DialogPosition {
	x: number;
	y: number;
}

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 360;
const MIN_HEIGHT = 280;
/** Keep at least this much gap between the modal and the viewport edges when snapped/clamped into view. */
const MARGIN = 16;
const DEFAULT_SIZE: DialogSize = { width: 820, height: 680 };

/** Never let the modal grow larger than the viewport (minus a margin) or shrink below a usable minimum. */
export function clampSize({ width, height }: DialogSize, vw: number, vh: number): DialogSize {
	return {
		width: Math.round(Math.max(MIN_WIDTH, Math.min(width, vw - MARGIN * 2))),
		height: Math.round(Math.max(MIN_HEIGHT, Math.min(height, vh - MARGIN * 2))),
	};
}

export function centerOf({ width, height }: DialogSize, vw: number, vh: number): DialogPosition {
	return {
		x: Math.round((vw - width) / 2),
		y: Math.round((vh - height) / 2),
	};
}

/** Pull a (possibly off-screen) position back so the whole modal sits within the viewport. */
export function clampPosition(
	{ x, y }: DialogPosition,
	{ width, height }: DialogSize,
	vw: number,
	vh: number,
): DialogPosition {
	const maxX = Math.max(MARGIN, vw - width - MARGIN);
	const maxY = Math.max(MARGIN, vh - height - MARGIN);
	return {
		x: Math.min(Math.max(x, MARGIN), maxX),
		y: Math.min(Math.max(y, MARGIN), maxY),
	};
}

/**
 * Drag + resize state for a modal. The size is persisted to local storage under a single shared key,
 * so resizing one modal is remembered across every resizable modal. The position is intentionally not
 * persisted: each time the modal opens it re-centers, and while dragging the user may pull it past the
 * edge (to peek behind it) — on release it snaps back fully into view.
 */
export function useResizableDialog() {
	const [storedSize, setStoredSize] = useLocalStorage<DialogSize>(LocalStorageKeys.ResizableModalSize, DEFAULT_SIZE);

	const [size, setSize] = useState<DialogSize>(() => clampSize(storedSize, window.innerWidth, window.innerHeight));
	const [position, setPosition] = useState<DialogPosition>(() => centerOf(size, window.innerWidth, window.innerHeight));
	const [isDragging, setIsDragging] = useState(false);
	const [isResizing, setIsResizing] = useState(false);
	const [isMaximized, setIsMaximized] = useState(false);

	// Mirror the latest values into refs so window listeners and the mount-time ref
	// callback can read current state without re-subscribing on every change.
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const positionRef = useRef(position);
	positionRef.current = position;
	const isMaximizedRef = useRef(isMaximized);
	isMaximizedRef.current = isMaximized;
	// Size/position captured before maximizing, so the button can restore them.
	const restoreRef = useRef<{ size: DialogSize; position: DialogPosition } | null>(null);
	// The user's persisted, *unclamped* preferred size. The rendered size is always a clamped
	// view of this, so shrinking the window and growing it back restores their chosen size.
	const desiredSizeRef = useRef(storedSize);
	desiredSizeRef.current = storedSize;
	// While a drag/resize gesture is live, this holds the teardown for its window listeners. onUp
	// clears it on release; if the dialog unmounts mid-gesture instead, the effect below runs it.
	const activeGestureRef = useRef<(() => void) | null>(null);

	// Re-center each time the dialog content mounts (i.e. each time the modal opens),
	// re-deriving the rendered size from the persisted preferred size. Radix may invoke this
	// ref more than once per render and on unmount, so we only act on a brand-new content
	// node — otherwise the setState here would re-trigger the ref and loop forever.
	const lastNodeRef = useRef<HTMLElement | null>(null);
	const contentRef = useCallback((node: HTMLElement | null) => {
		if (!node || node === lastNodeRef.current) {
			return;
		}
		lastNodeRef.current = node;
		// A fresh open always starts un-maximized at the preferred size.
		setIsMaximized(false);
		restoreRef.current = null;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const clamped = clampSize(desiredSizeRef.current, vw, vh);
		setSize(clamped);
		setPosition(centerOf(clamped, vw, vh));
	}, []);

	// Keep the modal within the viewport as the window changes: re-clamp the preferred size
	// (so it grows back when there's room again) and pull the position back into view.
	useEffect(() => {
		const onResize = () => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			if (isMaximizedRef.current) {
				// Stay filling the (new) screen.
				const maxSize = clampSize({ width: vw, height: vh }, vw, vh);
				setSize(maxSize);
				setPosition(centerOf(maxSize, vw, vh));
				return;
			}
			const clamped = clampSize(desiredSizeRef.current, vw, vh);
			setSize(clamped);
			setPosition(clampPosition(positionRef.current, clamped, vw, vh));
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	// onUp tears down a gesture's window listeners on mouse release. If the dialog unmounts while a
	// gesture is still live (Escape, route change, or a programmatic close with the button held),
	// onUp never fires — so clean up the live gesture here, dropping its listeners and the closure
	// capturing the now-stale content node.
	useEffect(() => () => activeGestureRef.current?.(), []);

	const startDrag = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		const node = lastNodeRef.current;
		const startX = event.clientX;
		const startY = event.clientY;
		const origin = { ...positionRef.current };
		setIsDragging(true);
		// A manual move means we're no longer "maximized".
		setIsMaximized(false);

		// Move imperatively via a compositor `transform`, coalesced to one update per frame, so the
		// heavy editor subtree is never re-rendered or re-laid-out mid-drag. We commit to React
		// state (left/top) only on release.
		let frame = 0;
		let dx = 0;
		let dy = 0;
		const apply = () => {
			frame = 0;
			if (node) {
				node.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
			}
		};
		const onMove = (e: MouseEvent) => {
			// No clamping mid-drag: allow dragging past the edge so the user can peek behind the modal.
			dx = e.clientX - startX;
			dy = e.clientY - startY;
			if (!frame) {
				frame = requestAnimationFrame(apply);
			}
		};
		// Remove the window listeners and cancel any pending frame. Stored in activeGestureRef so an
		// unmount mid-drag can run the same teardown (onUp would otherwise never fire to do it).
		const teardown = () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			activeGestureRef.current = null;
		};
		const onUp = () => {
			teardown();
			setIsDragging(false);
			// Snap back fully into view.
			const clamped = clampPosition(
				{ x: origin.x + dx, y: origin.y + dy },
				sizeRef.current,
				window.innerWidth,
				window.innerHeight,
			);
			// Commit to left/top and drop the live transform together so there's no flash.
			if (node) {
				node.style.left = `${clamped.x}px`;
				node.style.top = `${clamped.y}px`;
				node.style.transform = '';
			}
			setPosition(clamped);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		activeGestureRef.current = teardown;
	}, []);

	const startResize = useCallback((direction: ResizeDirection) => (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		const node = lastNodeRef.current;
		const startX = event.clientX;
		const startY = event.clientY;
		const startSize = { ...sizeRef.current };
		const startPos = { ...positionRef.current };
		setIsResizing(true);
		// A manual resize means we're no longer "maximized".
		setIsMaximized(false);

		// Like dragging, apply size/position imperatively (once per frame) and commit to state on release.
		let frame = 0;
		let nextSize = startSize;
		let nextPos = startPos;
		const apply = () => {
			frame = 0;
			if (node) {
				node.style.width = `${nextSize.width}px`;
				node.style.height = `${nextSize.height}px`;
				node.style.left = `${nextPos.x}px`;
				node.style.top = `${nextPos.y}px`;
			}
		};
		const onMove = (e: MouseEvent) => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			let width = startSize.width;
			let height = startSize.height;
			if (direction.includes('e')) {
				width = startSize.width + dx;
			}
			if (direction.includes('w')) {
				width = startSize.width - dx;
			}
			if (direction.includes('s')) {
				height = startSize.height + dy;
			}
			if (direction.includes('n')) {
				height = startSize.height - dy;
			}

			nextSize = clampSize({ width, height }, vw, vh);

			// When resizing from the top/left edges, keep the opposite edge anchored.
			let { x, y } = startPos;
			if (direction.includes('w')) {
				x = startPos.x + startSize.width - nextSize.width;
			}
			if (direction.includes('n')) {
				y = startPos.y + startSize.height - nextSize.height;
			}
			nextPos = { x, y };

			if (!frame) {
				frame = requestAnimationFrame(apply);
			}
		};
		// Remove the window listeners and cancel any pending frame. Stored in activeGestureRef so an
		// unmount mid-resize can run the same teardown (onUp would otherwise never fire to do it).
		const teardown = () => {
			if (frame) {
				cancelAnimationFrame(frame);
			}
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			activeGestureRef.current = null;
		};
		const onUp = () => {
			teardown();
			setIsResizing(false);
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const finalSize = clampSize(nextSize, vw, vh);
			setSize(finalSize);
			setPosition(clampPosition(nextPos, finalSize, vw, vh));
			// Persist the new size under the shared key so every resizable modal remembers it.
			setStoredSize(finalSize);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		activeGestureRef.current = teardown;
	}, [setStoredSize]);

	// Maximize fills the screen (within the standard margin); toggling again restores the size and
	// position from just before. Maximizing never touches the persisted preferred size.
	const toggleMaximize = useCallback(() => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		if (isMaximizedRef.current) {
			const prev = restoreRef.current;
			if (prev) {
				const restoredSize = clampSize(prev.size, vw, vh);
				setSize(restoredSize);
				setPosition(clampPosition(prev.position, restoredSize, vw, vh));
			}
			setIsMaximized(false);
		} else {
			restoreRef.current = { size: sizeRef.current, position: positionRef.current };
			const maxSize = clampSize({ width: vw, height: vh }, vw, vh);
			setSize(maxSize);
			setPosition(centerOf(maxSize, vw, vh));
			setIsMaximized(true);
		}
	}, []);

	return { size, position, isDragging, isResizing, isMaximized, contentRef, startDrag, startResize, toggleMaximize };
}
