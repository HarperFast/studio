import { cx } from 'class-variance-authority';

/** The visible drag affordance pinned to the tray's right edge; focus it and use Arrow keys to resize. */
export function SidebarResizeHandle({
	width,
	minWidth,
	maxWidth,
	isResizing,
	onPointerDown,
	onKeyDown,
}: {
	width: number;
	minWidth: number;
	maxWidth: number;
	isResizing: boolean;
	onPointerDown: (event: React.PointerEvent) => void;
	onKeyDown: (event: React.KeyboardEvent) => void;
}) {
	return (
		<div
			role="separator"
			tabIndex={0}
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			aria-valuenow={width}
			aria-valuemin={minWidth}
			aria-valuemax={maxWidth}
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			className={cx(
				'absolute top-0 right-0 bottom-0 w-1 z-40 cursor-col-resize touch-none outline-none',
				'hover:bg-violet-400/60 dark:hover:bg-violet-500/60 focus-visible:bg-violet-500/80 transition-colors',
				isResizing && 'bg-violet-400/60 dark:bg-violet-500/60',
			)}
		/>
	);
}
