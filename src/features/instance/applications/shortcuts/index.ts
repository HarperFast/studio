import { excludePropertyFalsy } from '@/lib/arrays/excludePropertyFalsy';
import { OnMount } from '@monaco-editor/react';
import { useEffect } from 'react';
import { Contract } from './contract';
import { deleteShortcut } from './deleteShortcut';
import { newDirectoryShortcut } from './newDirectoryShortcut';
import { newFileShortcut } from './newFileShortcut';
import { renameFileShortcut } from './renameFileShortcut';
import { revertFileShortcut } from './revertFileShortcut';
import { saveChangesShortcut } from './saveChangesShortcut';

const shortcuts: Contract[] = [
	deleteShortcut,
	newDirectoryShortcut,
	newFileShortcut,
	renameFileShortcut,
	revertFileShortcut,
	saveChangesShortcut,
];

const editorShortcuts = shortcuts.filter(excludePropertyFalsy('addEditorAction'));
const globalShortcuts = shortcuts.filter(excludePropertyFalsy('handleGlobal'));

export function registerWithEditor(mounted: Parameters<OnMount>) {
	const [editor, monaco] = mounted;
	const disposables = editorShortcuts
		.map(shortcut => editor.addAction(shortcut.addEditorAction(monaco)));
	return () => {
		for (const disposable of disposables) {
			disposable?.dispose();
		}
	};
}

export function useGlobalShortcutKeys() {
	useEffect(() => {
		document.addEventListener('keydown', keyDownHandler);

		return () => {
			document.removeEventListener('keydown', keyDownHandler);
		};
	}, []);
}

function keyDownHandler(e: KeyboardEvent) {
	const cmd = e.getModifierState('Meta');
	const alt = e.getModifierState('Alt');
	const shift = e.getModifierState('Shift');
	const ctrl = e.getModifierState('Control');
	const modifiers = { cmd, alt, shift, ctrl };

	for (const globalShortcut of globalShortcuts) {
		if (globalShortcut.handleGlobal(e.key, modifiers)) {
			e.preventDefault();
			return;
		}
	}
	console.log('unhandled key press', e.key, modifiers);
}
