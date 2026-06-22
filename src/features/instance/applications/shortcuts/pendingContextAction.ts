/**
 * Bridges the file-tree context menu's current target to the global keyboard
 * shortcut handler.
 *
 * Right-clicking a row no longer selects it (so the editor view isn't disturbed
 * — see FileTreeContextMenu), but a keyboard shortcut fired while the menu is
 * open (e.g. Cmd/Ctrl+Delete) must still act on the right-clicked row rather
 * than the background selection — otherwise it would delete the wrong file.
 *
 * While its menu is open the context menu registers an applier here that aligns
 * the tree selection to the right-clicked row. The shortcut handler runs it (in
 * the same batch the modal opens), exactly mirroring a menu-item click. When no
 * menu is open the applier is undefined and this is a no-op, so right-click
 * itself never changes the selection.
 */
let applier: (() => void) | undefined;

export function setPendingContextAction(apply: (() => void) | undefined): void {
	applier = apply;
}

export function applyPendingContextAction(): void {
	applier?.();
}
