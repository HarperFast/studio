import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { registerWithEditor } from '@/features/instance/applications/shortcuts';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useListener } from '@/lib/events/listener';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useState } from 'react';
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
	const {
		content: updatedFileContent,
		setContent,
	} = useEditorFileContent(!!openedEntry && !openedEntry.package && openedEntry.path);

	const setUpdatedFileContent = useCallback((newValue: string | undefined) => {
		setContent(newValue !== openedEntryContents ? newValue : undefined);
	}, [openedEntryContents, setContent]);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const [mounted, setMounted] = useState<Parameters<OnMount> | null>(null);

	const extension = parseFileExtension(openedEntry?.path);
	const language = extensionToLanguageMap[extension] || 'plaintext';

	const handleEditorDidMount: EditorProps['onMount'] = useCallback<OnMount>((editor, monaco) => {
		setMounted([editor, monaco]);
	}, []);

	useEffect(() => {
		if (mounted && canManageBrowseInstance && !openedEntry?.package && !restrictPackageModification) {
			return registerWithEditor(mounted);
		}
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
	);
}
