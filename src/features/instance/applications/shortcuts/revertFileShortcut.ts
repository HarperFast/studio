import { curryEmitToListeners } from '@/lib/events/listener';
import { Contract } from './contract';

export const revertFileShortcut = {
	addEditorAction() {
		return {
			id: 'revert-file',
			label: 'Revert File',
			run: curryEmitToListeners('RevertChanges', true),
		};
	},
} satisfies Contract;
