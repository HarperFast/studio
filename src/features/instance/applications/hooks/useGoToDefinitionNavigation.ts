/**
 * Makes "Go to Definition" (and friends — Go to References, Ctrl/Cmd-click)
 * actually navigate across an application's files.
 *
 * The TypeScript worker already resolves a symbol to its defining file (now that
 * sibling files are loaded as models — see `useApplicationTypeIntelligence`).
 * But a standalone Monaco editor only knows how to move the cursor *within* the
 * open model; when the definition lives in another file it asks its host how to
 * open that resource, and a bare `<Editor>` has no answer — so the command
 * silently does nothing.
 *
 * `monaco.editor.registerEditorOpener` is that missing host hook. We translate
 * the target `file:///<project>/<path>` URI back to an application file and open
 * it through the same focus/select path the sidebar uses, then reveal the
 * definition's range once the editor swaps to the file's model.
 *
 * Targets that aren't application files (e.g. acquired `@types` under
 * `node_modules`) are declined, so peeking library types still works while we
 * don't try to surface read-only library buffers in the tree.
 */
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useEffect, useRef } from 'react';

function toRange(selectionOrPosition?: monaco.IRange | monaco.IPosition): monaco.IRange | undefined {
	if (!selectionOrPosition) {
		return undefined;
	}
	if ('startLineNumber' in selectionOrPosition) {
		return selectionOrPosition;
	}
	const { lineNumber, column } = selectionOrPosition;
	return { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: column };
}

/**
 * Reveal `range` once `source` is showing `targetUri`. The model swap is driven
 * by a React state update, so we wait for it; the reveal itself is deferred a
 * tick so it wins against `@monaco-editor/react` restoring the file's last-known
 * cursor position on switch.
 */
function revealWhenModelReady(
	source: monaco.editor.ICodeEditor,
	targetUri: string,
	range: monaco.IRange | undefined,
): void {
	const tryReveal = (): boolean => {
		if (source.getModel()?.uri.toString() !== targetUri) {
			return false;
		}
		if (range) {
			setTimeout(() => {
				if (source.getModel()?.uri.toString() === targetUri) {
					source.setSelection(range);
					source.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
					source.focus();
				}
			}, 0);
		}
		return true;
	};
	if (tryReveal()) {
		return;
	}
	const listener = source.onDidChangeModel(() => {
		if (tryReveal()) {
			listener.dispose();
		}
	});
	// Safety net: never leak the listener if the expected swap never happens.
	setTimeout(() => listener.dispose(), 8000);
}

export function useGoToDefinitionNavigation(): void {
	const { setExpandedItems, setSelectedItems, setFocusedItem, entryExists } = useEditorView();

	// The opener is registered once but must see the latest handlers.
	const openFileRef = useRef<(appPath: string) => void>(() => {});
	openFileRef.current = (appPath: string) => {
		setExpandedItems(expandedItems => {
			const expansion = new Set(expandedItems);
			const parts = appPath.split('/');
			for (let depth = 1; depth < parts.length; depth++) {
				expansion.add(parts.slice(0, depth).join('/'));
			}
			return [...expansion];
		});
		setSelectedItems([appPath]);
		setFocusedItem(appPath);
	};

	const entryExistsRef = useRef(entryExists);
	entryExistsRef.current = entryExists;

	useEffect(() => {
		const disposable = monaco.editor.registerEditorOpener({
			openCodeEditor(source, resource, selectionOrPosition) {
				if (source.getModel()?.uri.toString() === resource.toString()) {
					return false; // Same file — let Monaco move the cursor itself.
				}
				const appPath = resource.path.replace(/^\/+/, '');
				if (!entryExistsRef.current(appPath)) {
					return false; // Not an application file (e.g. a library declaration).
				}
				openFileRef.current(appPath);
				revealWhenModelReady(source, resource.toString(), toRange(selectionOrPosition));
				return true;
			},
		});
		return () => disposable.dispose();
	}, []);
}
