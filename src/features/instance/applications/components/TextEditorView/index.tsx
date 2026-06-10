import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ALL_EDITOR_COMMAND_IDS } from '@/features/instance/applications/components/editorMenuCommands';
import { setEditorShortcutLabels } from '@/features/instance/applications/components/editorShortcutLabels';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useApplicationTypeIntelligence } from '@/features/instance/applications/hooks/useApplicationTypeIntelligence';
import { useCodeNavigation } from '@/features/instance/applications/hooks/useCodeNavigation';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { registerWithEditor } from '@/features/instance/applications/shortcuts';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useListener } from '@/lib/events/listener';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useState } from 'react';
import { configureHarperLanguageSupport } from './harper-language';
import './monaco-customizations.css';

const extensionToLanguageMap: Record<string, string> = {
	js: 'javascript',
	cjs: 'javascript',
	jsx: 'javascript',
	yaml: 'yaml',
	yml: 'yaml',
	ts: 'typescript',
	tsx: 'typescript',
	json: 'json',
	md: 'markdown',
	html: 'html',
	css: 'css',
	graphql: 'graphql',
	mjs: 'javascript',
};

/**
 * Resolve the platform-correct keyboard-shortcut label (e.g. `⌘F` / `Ctrl+F`)
 * for each editor command id, from Monaco's keybinding registry. The keybinding
 * service isn't on the public editor API, so we locate it by shape rather than
 * its minified name.
 */
function lookupEditorShortcuts(editor: Parameters<OnMount>[0], ids: string[]): Record<string, string> {
	const service = Object.values(editor as unknown as Record<string, unknown>).find(
		(value): value is { lookupKeybinding(id: string): { getLabel(): string | null } | undefined } =>
			!!value && typeof (value as { lookupKeybinding?: unknown }).lookupKeybinding === 'function',
	);
	const labels: Record<string, string> = {};
	if (!service) {
		return labels;
	}
	for (const id of ids) {
		const label = service.lookupKeybinding(id)?.getLabel();
		if (label) {
			labels[id] = label;
		}
	}
	return labels;
}

export function TextEditorView() {
	const instanceParams = useInstanceClientIdParams();
	const { openedEntryContents, openedEntry, restrictPackageModification, isSavingFile, saveFile, rootEntries } =
		useEditorView();
	useApplicationTypeIntelligence(openedEntry, rootEntries);
	const {
		content: updatedFileContent,
		setContent,
	} = useEditorFileContent(!!openedEntry && !openedEntry.package && openedEntry.path);

	const setUpdatedFileContent = useCallback((newValue: string | undefined) => {
		setContent(newValue !== openedEntryContents ? newValue : undefined);
	}, [openedEntryContents, setContent]);

	const monacoTheme = useMonacoTheme();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	const [mounted, setMounted] = useState<Parameters<OnMount> | null>(null);
	useCodeNavigation(mounted?.[0]);

	const extension = parseFileExtension(openedEntry?.path);
	const language = extensionToLanguageMap[extension] || 'plaintext';

	const handleEditorWillMount: EditorProps['beforeMount'] = useCallback((monaco) => {
		configureHarperLanguageSupport(monaco);
	}, []);

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

	// Run a Monaco editor command requested from the toolbar's Edit/Go menus.
	useListener(
		'RunEditorAction',
		(actionId) => {
			void mounted?.[0]?.getAction(actionId)?.run();
		},
		[mounted],
	);

	// Publish each surfaced command's keyboard-shortcut label so the menus can
	// show it. Done once the editor (and its keybinding registry) is available.
	useEffect(() => {
		if (mounted) {
			setEditorShortcutLabels(lookupEditorShortcuts(mounted[0], ALL_EDITOR_COMMAND_IDS));
		}
	}, [mounted]);

	if (!openedEntry) {
		return null;
	}

	const readOnly = isSavingFile || !!openedEntry.package || !canManageBrowseInstance;

	return (
		<Editor
			className="w-full min-h-full h-80"
			path={openedEntry.path}
			language={language}
			theme={monacoTheme}
			value={updatedFileContent ?? openedEntryContents}
			keepCurrentModel
			beforeMount={handleEditorWillMount}
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
