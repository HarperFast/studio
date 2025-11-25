import { curryEmitToListeners, emitToListeners } from '@/lib/events/listener';
import { Contract } from './contract';

export const saveChangesShortcut = {
	handleGlobal(key, modifiers) {
		if (modifiers.cmd && key === 's') {
			emitToListeners('SaveFile', true);
			return true;
		}
	},
	addEditorAction(monaco) {
		return {
			id: 'save-file',
			label: 'Save Changes',
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
			run: curryEmitToListeners('SaveFile', true),
		};
	},
} satisfies Contract;
