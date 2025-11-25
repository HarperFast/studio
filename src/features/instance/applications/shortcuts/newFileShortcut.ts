import { currySetWatchedValue, setWatchedValue } from '@/lib/events/watcher';
import { Contract } from './contract';

export const newFileShortcut = {
	handleGlobal(key, modifiers) {
		if (modifiers.ctrl && key === 'n') {
			setWatchedValue('ShowAddDirectoryOrFileModalType', 'file');
			return true;
		}
	},
	addEditorAction(monaco) {
		return {
			id: 'new-file',
			label: 'New File',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyN],
			run: currySetWatchedValue('ShowAddDirectoryOrFileModalType', 'file'),
		};
	},
} satisfies Contract;
