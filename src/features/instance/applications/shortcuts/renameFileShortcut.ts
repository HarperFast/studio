import { currySetWatchedValue, setWatchedValue } from '@/lib/events/watcher';
import { Contract } from './contract';

export const renameFileShortcut = {
	handleGlobal(key) {
		if (key === 'F2') {
			setWatchedValue('ShowRenameFileModal', 'file');
			return true;
		}
	},
	addEditorAction(monaco) {
		return {
			id: 'rename-file',
			label: 'Rename File',
			keybindings: [
				monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.KeyR,
				monaco.KeyCode.F2,
			],
			run: currySetWatchedValue('ShowRenameFileModal', true),
		};
	},
} satisfies Contract;
