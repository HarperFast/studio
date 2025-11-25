import { OnMount } from '@monaco-editor/react';

export interface Contract {
	handleGlobal?(
		key: string,
		modifierState: {
			cmd: boolean;
			alt: boolean;
			shift: boolean;
			ctrl: boolean;
		},
	): true | undefined;

	addEditorAction?(
		monaco: Parameters<OnMount>[1],
	): Parameters<Parameters<OnMount>[0]['addAction']>[0];
}
