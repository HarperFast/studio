import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ContentActions } from '@/features/instance/applications/components/ContentActions';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { curryEmitToListeners, useListener } from '@/lib/events/listener';
import { currySetWatchedValue } from '@/lib/events/watcher';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useState } from 'react';
import './directory-read-me.css';
import './monaco-customizations.css';

const extensionToLanguageMap: Record<string, string> = {
	js: 'javascript',
	cjs: 'javascript',
	jsx: 'javascript',
	yaml: 'yaml',
	ts: 'typescript',
	tsx: 'typescript',
	json: 'json',
	md: 'markdown',
	html: 'html',
	css: 'css',
	graphql: 'graphql',
	mjs: 'javascript',
};

export function TextEditorView() {
	const instanceParams = useInstanceClientIdParams();
	const { openedEntryContents, openedEntry, restrictPackageModification, isSavingFile, saveFile } = useEditorView();
	const { content: updatedFileContent, setContent } = useEditorFileContent(!!openedEntry && !openedEntry.package && openedEntry.path);

	const setUpdatedFileContent = useCallback((newValue: string | undefined) => {
		setContent(newValue !== openedEntryContents ? newValue : undefined);
	}, [openedEntryContents]);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const [mounted, setMounted] = useState<Parameters<OnMount> | null>(null);
	const [language, setLanguage] = useState('javascript');

	useEffect(() => {
		const extension = parseFileExtension(openedEntry?.path);
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [openedEntry]);

	const handleEditorDidMount: EditorProps['onMount'] = useCallback<OnMount>((editor, monaco) => {
		setMounted([editor, monaco]);
	}, []);

	useEffect(() => {
		if (!mounted || !canManageBrowseInstance || !!openedEntry?.package || restrictPackageModification) {
			return;
		}
		const [editor, monaco] = mounted;
		const disposables = [
			editor.addAction({
				id: 'new-file',
				label: 'New File',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.KeyN],
				run: currySetWatchedValue('ShowAddDirectoryOrFileModalType', 'file'),
			}),
			editor.addAction({
				id: 'rename-file',
				label: 'Rename File',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.KeyR],
				run: currySetWatchedValue('ShowRenameFileModal', true),
			}),
			editor.addAction({
				id: 'new-directory',
				label: 'New Directory',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyN],
				run: currySetWatchedValue('ShowAddDirectoryOrFileModalType', 'directory'),
			}),
			editor.addAction({
				id: 'save-file',
				label: 'Save Changes',
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
				run: curryEmitToListeners('SaveFile', true),
			}),
			editor.addAction({
				id: 'revert-file',
				label: 'Revert File',
				run: curryEmitToListeners('RevertChanges', true),
			}),
			editor.addAction({
				id: 'delete-file',
				label: 'Delete File',
				run: currySetWatchedValue('ShowDeleteDirectoryOrFileModal', true),
			}),
		];
		return () => {
			for (const disposable of disposables) {
				disposable?.dispose();
			}
		};
	}, [mounted, canManageBrowseInstance, openedEntry, restrictPackageModification]);

	useListener(
		'SaveFile',
		() => {
			if (openedEntry && !isSavingFile && updatedFileContent !== undefined) {
				saveFile(
					{
						...instanceParams,
						file: openedEntry.path.split('/').slice(1).join('/'),
						payload: updatedFileContent,
						project: openedEntry.project,
					},
					openedEntry.path,
				);
			}
		},
		[openedEntry, instanceParams, updatedFileContent],
	);

	useListener(
		'RevertChanges',
		() => {
			if (openedEntryContents !== undefined && mounted) {
				const [editor] = mounted;
				setUpdatedFileContent(undefined);
				editor.setValue(openedEntryContents);
			}
		},
		[openedEntryContents, mounted],
	);

	if (!openedEntry) {
		return null;
	}

	const readOnly = isSavingFile || !!openedEntry.package || !canManageBrowseInstance;

	return (
		<>
			<Editor
				className="w-full min-h-full h-80"
				language={language}
				theme="vs-dark"
				value={updatedFileContent ?? openedEntryContents}
				onMount={handleEditorDidMount}
				onChange={readOnly ? undefined : setUpdatedFileContent}
				options={{
					automaticLayout: true,
					minimap: { enabled: false },
					readOnly,
					padding: { top: 48 },
				}}
			/>
			<ContentActions />
		</>
	);
}
