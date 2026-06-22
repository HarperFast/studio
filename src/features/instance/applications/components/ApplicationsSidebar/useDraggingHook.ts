import { useCallback, useEffect, useMemo, useState } from 'react';
import { importedApplications, newApplication } from './specialItems';

export function useDraggingHook() {
	const [dragging, setDragging] = useState(false);
	const [dragTarget, setDragTarget] = useState<Element | undefined>(undefined);
	const startDragging = useCallback((e: DragEvent) => {
		const foundFiles = e.dataTransfer?.types?.includes('Files');
		if (!foundFiles) {
			return;
		}
		// Resolve the folder button for the row under the cursor. e.target may be
		// the button itself, a child of it (icon/label), or — now that the arrow's
		// hit area is enlarged — the sibling arrow. The arrow is a sibling of the
		// button (not an ancestor), so a plain `closest` would miss it; fall back
		// to querying the shared title-container for the row's folder button.
		const el = e.target instanceof Element ? e.target : null;
		const folderButton = el?.closest<HTMLElement>('.rct-tree-item-button-isFolder')
			?? el?.closest('.rct-tree-item-title-container')
				?.querySelector<HTMLElement>(':scope > .rct-tree-item-button-isFolder')
			?? null;
		if (folderButton) {
			const itemId = folderButton.getAttribute('data-rct-item-id');
			const isLocked = folderButton.querySelector('.packageIsLocked');
			if (
				!isLocked && itemId && itemId !== importedApplications && itemId !== newApplication
			) {
				setDragTarget(currentTarget => {
					if (currentTarget !== folderButton) {
						currentTarget?.classList?.remove?.('rct-tree-item-title-container-dragging-over');
						folderButton.classList.add('rct-tree-item-title-container-dragging-over');
						return folderButton;
					}
					return currentTarget;
				});
			}
		}
		setDragging(true);
	}, []);

	const dragLeave = useCallback(() => {
		setDragging(false);
		setDragTarget(currentTarget => {
			if (currentTarget) {
				currentTarget.classList.remove('rct-tree-item-title-container-dragging-over');
			}
			return undefined;
		});
	}, []);

	const dropped = useCallback((e: DragEvent) => {
		const foundFiles = e.dataTransfer?.types?.includes('Files');
		if (!foundFiles) {
			return;
		}
		if (e.detail === 1337) {
			// Prevent a recursive dispatch.
			return;
		}
		setDragging(false);
		if (dragTarget) {
			dragTarget.classList.remove('rct-tree-item-title-container-dragging-over');
			setDragTarget(undefined);
		}
		const dropTarget = document.getElementById('dropTarget');
		if (dropTarget) {
			return dropTarget.dispatchEvent(
				new DragEvent('drop', {
					bubbles: true,
					detail: 1337, // Prevent a recursive dispatch.
					cancelable: true,
					dataTransfer: e.dataTransfer,
				}),
			);
		}
		return false;
	}, [dragTarget]);

	useEffect(() => {
		document.addEventListener('dragenter', startDragging);
		document.addEventListener('dragover', startDragging);
		document.addEventListener('dragleave', dragLeave);
		document.addEventListener('drop', dropped);

		return () => {
			document.removeEventListener('dragenter', startDragging);
			document.removeEventListener('dragover', startDragging);
			document.removeEventListener('dragleave', dragLeave);
			document.removeEventListener('drop', dropped);
		};
	}, [startDragging, dropped, dragLeave]);

	return useMemo(() => ({ dragging, dragTarget }), [dragging, dragTarget]);
}
