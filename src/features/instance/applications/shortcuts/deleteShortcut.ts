import { currySetWatchedValue, setWatchedValue } from '@/lib/events/watcher';
import { Contract } from './contract';

export const deleteShortcut = {
	handleGlobal(key) {
		if (key === 'Backspace') {
			setWatchedValue('ShowDeleteDirectoryOrFileModal', true);
			return true;
		}
	},
	addEditorAction(monaco) {
		return {
			id: 'delete-file',
			label: 'Delete File',
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Delete],
			run: currySetWatchedValue('ShowDeleteDirectoryOrFileModal', true),
		};
	},
} satisfies Contract;
