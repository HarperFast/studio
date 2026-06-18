import * as DialogPrimitive from '@radix-ui/react-dialog';
import { GripHorizontal, Maximize, Minimize, XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';
import { type ResizeDirection, useResizableDialog } from './useResizableDialog';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-white/80 backdrop-blur-xs dark:bg-black-dark/90 dark:backdrop-blur-none',
				className,
			)}
			{...props}
		/>
	);
}

function DialogCloseButton({ className }: { className?: string }) {
	return (
		<DialogPrimitive.Close
			// Anchored to the very corner with padding so the whole top-right corner is a click target,
			// not just the X glyph. The icon still sits ~16px in (matching its old position).
			className={cn(
				"ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-0 right-0 flex items-start justify-end rounded-bl-md p-4 opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
		>
			<XIcon className="text-popover-foreground" />
			<span className="sr-only">Close</span>
		</DialogPrimitive.Close>
	);
}

/**
 * Resize handles, one per edge and corner. Each straddles the modal border and extends ~8px
 * outward (negative insets) for a generous, forgiving hit area — only possible because the
 * content shell below does not clip its overflow. Edges are inset from the corners so the corner
 * handles own the very corners (where both axes resize); edges sit at z-30, corners above at z-40.
 */
const RESIZE_HANDLES: { dir: ResizeDirection; className: string }[] = [
	{ dir: 'n', className: '-top-2 inset-x-5 h-4 cursor-ns-resize z-30' },
	{ dir: 's', className: '-bottom-2 inset-x-5 h-4 cursor-ns-resize z-30' },
	{ dir: 'e', className: '-right-2 inset-y-5 w-4 cursor-ew-resize z-30' },
	{ dir: 'w', className: '-left-2 inset-y-5 w-4 cursor-ew-resize z-30' },
	{ dir: 'nw', className: '-top-2 -left-2 size-6 cursor-nwse-resize z-40' },
	{ dir: 'ne', className: '-top-2 -right-2 size-6 cursor-nesw-resize z-40' },
	{ dir: 'sw', className: '-bottom-2 -left-2 size-6 cursor-nesw-resize z-40' },
	{ dir: 'se', className: '-bottom-2 -right-2 size-6 cursor-nwse-resize z-40' },
];

function ResizableDialogContent(
	{ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>,
) {
	const { size, position, isDragging, isResizing, isMaximized, contentRef, startDrag, startResize, toggleMaximize } =
		useResizableDialog();

	const headerButtonClass =
		'ring-offset-background focus:ring-ring text-popover-foreground flex size-8 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none';

	return (
		<DialogPortal data-slot="dialog-portal">
			{/* Drop the backdrop to fully transparent while dragging so the user can see what's behind the modal. */}
			<DialogOverlay className={cn('transition-opacity duration-200', isDragging && 'opacity-0')} />
			<DialogPrimitive.Content
				ref={contentRef}
				data-slot="dialog-content"
				style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
				className={cn(
					'bg-popover '
						+ 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 '
						+ 'fixed z-50 '
						+ 'rounded-md border shadow-2xl '
						// Deliberately NOT clipped here: the resize handles below extend past the modal edges,
						// so the inner body does the clipping instead. No transition either — dragging/resizing
						// move the modal imperatively every frame and an implicit `transition: all` would make
						// it lag behind the cursor. (Open/close still animate.)
						+ 'transition-none',
					isDragging && 'will-change-transform',
					className,
				)}
				{...props}
			>
				{/* Inner body holds the actual UI and clips it to the rounded rect. */}
				<div
					className={cn(
						'flex h-full w-full flex-col gap-4 overflow-hidden rounded-md p-6',
						(isDragging || isResizing) && 'select-none',
					)}
				>
					{/* Title-bar strip: grab anywhere across the top to drag the modal around. */}
					<div
						onMouseDown={startDrag}
						className="absolute inset-x-0 top-0 z-10 flex h-12 cursor-move items-start justify-center"
						aria-hidden
					>
						<GripHorizontal className="mt-1 size-4 text-muted-foreground/40" />
					</div>
					{children}
					{
						/* Header actions — maximize/restore and close — vertically centered on the title row
					    (top-6 matches the body's p-6, and the row's height matches the text-lg title line). */
					}
					<div className="absolute top-6 right-4 z-20 flex h-[1.125rem] items-center gap-1">
						<button
							type="button"
							onClick={toggleMaximize}
							aria-label={isMaximized ? 'Restore modal size' : 'Maximize modal'}
							className={headerButtonClass}
						>
							{isMaximized ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
						</button>
						<DialogPrimitive.Close aria-label="Close" className={headerButtonClass}>
							<XIcon className="size-4" />
							<span className="sr-only">Close</span>
						</DialogPrimitive.Close>
					</div>
				</div>
				{/* Resize handles sit outside the clipped body so their hit area can extend past the edges. */}
				{RESIZE_HANDLES.map(({ dir, className: handleClassName }) => (
					<div
						key={dir}
						data-resize-handle={dir}
						onMouseDown={startResize(dir)}
						className={cn('absolute', handleClassName)}
						aria-hidden
					/>
				))}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogContent(
	{ className, children, resizable, ...props }:
		& React.ComponentProps<typeof DialogPrimitive.Content>
		& { resizable?: boolean },
) {
	if (resizable) {
		return (
			<ResizableDialogContent className={className} {...props}>
				{children}
			</ResizableDialogContent>
		);
	}

	return (
		<DialogPortal data-slot="dialog-portal">
			<DialogOverlay />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					'bg-popover '
						+ 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 '
						+ 'fixed top-[50%] left-[50%] z-50 grid '
						+ 'w-full max-w-[calc(100%-2rem)] lg:max-w-2xl '
						+ 'max-h-screen overflow-y-auto '
						+ 'translate-x-[-50%] translate-y-[-50%] '
						+ 'gap-4 rounded-md border p-6 shadow-2xl '
						+ 'duration-200',
					className,
				)}
				{...props}
			>
				{children}
				<DialogCloseButton />
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="dialog-header"
			className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
			{...props}
		/>
	);
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn('text-lg leading-none text-popover-foreground font-semibold', className)}
			{...props}
		/>
	);
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn('text-muted-foreground text-sm', className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
