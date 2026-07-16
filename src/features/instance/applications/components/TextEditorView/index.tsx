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
import { Editor } from '@/lib/monaco/MonacoEditor';
import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useState } from 'react';
import { DegradedIntelliSenseBanner, type IntelliSenseDegradation } from './DegradedIntelliSenseBanner';
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
	// SVG is XML — highlight it as such when dropping down to edit its source.
	svg: 'xml',
	xml: 'xml',
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
	const { typeAcquisitionBudgetExhausted } = useApplicationTypeIntelligence(openedEntry, rootEntries);
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

	// Which degradation notice the user has dismissed, keyed by `<path>:<variant>`
	// so it re-shows for a different file or a different degradation, but stays
	// dismissed while the same file/mode is open.
	const [dismissedBanner, setDismissedBanner] = useState<string | null>(null);

	const extension = parseFileExtension(openedEntry?.path);
	const fileContent = updatedFileContent ?? openedEntryContents;
	// A huge open file would feed its full text to the language worker the same
	// way sibling models do, overflowing the structured-clone buffer
	// ("DataCloneError: ... out of memory."). Render it as plaintext so no
	// language service runs against it.
	const oversized = (fileContent?.length ?? 0) > MAX_WORKER_MODEL_CHARS;
	const language = oversized ? 'plaintext' : extensionToLanguageMap[extension] || 'plaintext';

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

	// Return focus to the editor after a file-tree modal closes (e.g. creating or renaming
	// a file). Deferred a frame so it wins the focus race against the closing dialog.
	useListener(
		'FocusEditor',
		() => {
			requestAnimationFrame(() => mounted?.[0]?.focus());
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

	// Surface either silent editor degradation as a dismissible notice. Oversized
	// wins: the file is already plaintext, so the "cannot find module" wording
	// wouldn't apply. The budget notice only fits a real (editable) script file,
	// where a missing package's import would actually error.
	const isScriptLanguage = language === 'javascript' || language === 'typescript';
	const degradation: IntelliSenseDegradation | null = oversized
		? 'oversized'
		: (typeAcquisitionBudgetExhausted && isScriptLanguage && !openedEntry.package)
		? 'budget'
		: null;
	const bannerKey = degradation ? `${openedEntry.path}:${degradation}` : null;
	const showBanner = bannerKey !== null && dismissedBanner !== bannerKey;

	return (
		// `h-full` (not `min-h-full`) gives this column a *definite* height, so the
		// editor's `height:100%` resolves; the `flex-1 min-h-0` wrapper then hands
		// Monaco a concrete, banner-adjusted height it can lay out against.
		<div className="flex h-full w-full flex-col">
			{showBanner && degradation && (
				<DegradedIntelliSenseBanner
					variant={degradation}
					onDismiss={() => setDismissedBanner(bannerKey)}
				/>
			)}
			<div className="min-h-0 flex-1">
				<Editor
					className="h-full w-full"
					path={openedEntry.path}
					language={language}
					theme={monacoTheme}
					value={fileContent}
					keepCurrentModel
					beforeMount={handleEditorWillMount}
					onMount={handleEditorDidMount}
					onChange={readOnly ? undefined : setUpdatedFileContent}
					options={{
						automaticLayout: true,
						minimap: { enabled: false },
						readOnly,
						// When the banner sits above the editor it already clears the toolbar
						// overlay, so the editor only needs a little breathing room; otherwise
						// it reserves the toolbar's height itself.
						padding: { top: showBanner ? 8 : 48 },
					}}
				/>
			</div>
		</div>
	);
}
