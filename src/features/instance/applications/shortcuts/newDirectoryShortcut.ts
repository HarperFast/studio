import { currySetWatchedValue, setWatchedValue } from '@/lib/events/watcher';
import { Contract } from './contract';

export const newDirectoryShortcut = {
	handleGlobal(key, modifiers) {
		if (modifiers.ctrl && modifiers.alt && modifiers.shift && key === '˜' /*n*/) {
			setWatchedValue('ShowAddDirectoryOrFileModalType', 'directory');
			return true;
		}
	},
	addEditorAction(monaco) {
		return {
			id: 'new-directory',
			label: 'New Directory',
			keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyN],
			run: currySetWatchedValue('ShowAddDirectoryOrFileModalType', 'directory'),
		};
	},
} satisfies Contract;
