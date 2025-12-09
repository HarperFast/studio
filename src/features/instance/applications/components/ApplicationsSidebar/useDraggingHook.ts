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
		const newTarget = e.target;
		if (
			newTarget instanceof Element
			&& newTarget.classList.contains('rct-tree-item-button-isFolder')
		) {
			const itemId = newTarget.getAttribute('data-rct-item-id');
			const isLocked = newTarget.querySelector('.packageIsLocked');
			if (!isLocked && itemId && itemId !== importedApplications && itemId !== newApplication) {
				setDragTarget(currentTarget => {
					if (currentTarget !== newTarget) {
						currentTarget?.classList?.remove?.('rct-tree-item-title-container-dragging-over');
						newTarget.classList.add('rct-tree-item-title-container-dragging-over');
						return newTarget;
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
