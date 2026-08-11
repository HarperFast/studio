import type { Monaco, OnMount } from '@monaco-editor/react';
import { useCallback, useRef } from 'react';
import type { RecordJsonError } from './recordEditorJson';

/**
 * A failed save is the only diagnostic the record editors get: their language
 * registers no worker, so nothing draws squiggles as the buffer is typed (see
 * `workerFreeJsonLanguage.ts`). When the submit-time parse fails somewhere the
 * engine can name, mark that spot by hand and scroll to it — a toast alone
 * leaves the user hunting for "line 4,213" in a record that doesn't fit on
 * screen.
 */

type RecordEditor = Parameters<OnMount>[0];
type RecordEditorModel = NonNullable<ReturnType<RecordEditor['getModel']>>;

/** Marker owner. Nothing else writes markers for these editors, so clearing by owner can't wipe
 * another provider's diagnostics. */
const MARKER_OWNER = 'record-json';

/** Wires an editor's `onMount` to the marker helpers below, so a modal can report a parse failure
 * without holding the editor instance itself. */
export function useRecordJsonErrorMarker() {
	const editorRef = useRef<RecordEditor | null>(null);
	const monacoRef = useRef<Monaco | null>(null);

	const onEditorMount = useCallback<OnMount>((editor, monaco) => {
		editorRef.current = editor;
		monacoRef.current = monaco;
	}, []);

	const showRecordJsonError = useCallback((error: RecordJsonError) => {
		if (editorRef.current && monacoRef.current) {
			setRecordJsonErrorMarker(editorRef.current, monacoRef.current, error);
		}
	}, []);

	const clearRecordJsonError = useCallback(() => {
		if (editorRef.current && monacoRef.current) {
			clearRecordJsonErrorMarker(editorRef.current, monacoRef.current);
		}
	}, []);

	return { onEditorMount, showRecordJsonError, clearRecordJsonError };
}

/**
 * Mark `error` on its line, scroll it into view, and put the cursor on it. An error the engine
 * couldn't place only clears the previous marker — the toast still carries the reason.
 */
export function setRecordJsonErrorMarker(editor: RecordEditor, monaco: Monaco, error: RecordJsonError): void {
	const model = editor.getModel();
	if (!model) {
		return;
	}
	// The location comes from a parse of the *submitted* text, which is the model's text, but clamp
	// anyway: an out-of-range marker is dropped silently and `setPosition` would move the cursor
	// somewhere the error isn't.
	const location = error.location && clampToModel(model, error.location);
	monaco.editor.setModelMarkers(
		model,
		MARKER_OWNER,
		location
			? [{
				severity: monaco.MarkerSeverity.Error,
				message: error.message,
				startLineNumber: location.lineNumber,
				startColumn: location.column,
				endLineNumber: location.lineNumber,
				// Through the end of the line: a zero-width marker draws no squiggle.
				endColumn: Math.max(model.getLineMaxColumn(location.lineNumber), location.column + 1),
			}]
			: [],
	);
	if (!location) {
		return;
	}
	editor.revealLineInCenter(location.lineNumber);
	editor.setPosition(location);
	editor.focus();
}

/** Drop the marker left by the last failed save — the buffer it described has changed. */
export function clearRecordJsonErrorMarker(editor: RecordEditor, monaco: Monaco): void {
	const model = editor.getModel();
	if (model) {
		monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
	}
}

function clampToModel(model: RecordEditorModel, { lineNumber, column }: { lineNumber: number; column: number }) {
	const clampedLine = Math.min(Math.max(lineNumber, 1), model.getLineCount());
	return {
		lineNumber: clampedLine,
		column: Math.min(Math.max(column, 1), model.getLineMaxColumn(clampedLine)),
	};
}
