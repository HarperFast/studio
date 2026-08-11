import type { Monaco, OnMount } from '@monaco-editor/react';
import { describe, expect, it, vi } from 'vitest';
import { clearRecordJsonErrorMarker, setRecordJsonErrorMarker } from './recordJsonErrorMarker';

type RecordEditor = Parameters<OnMount>[0];

/** A model of `lines`, plus the editor/monaco surface the marker helpers actually touch. */
function fakeEditor(lines: string[]) {
	const model = {
		getLineCount: () => lines.length,
		// Monaco columns are 1-based and one past the last character is a valid position.
		getLineMaxColumn: (lineNumber: number) => (lines[lineNumber - 1]?.length ?? 0) + 1,
	};
	const editor = {
		getModel: () => model,
		revealLineInCenter: vi.fn(),
		setPosition: vi.fn(),
		focus: vi.fn(),
	};
	const monaco = {
		MarkerSeverity: { Error: 8 },
		editor: { setModelMarkers: vi.fn() },
	};
	return {
		model,
		editor: editor as unknown as RecordEditor,
		monaco: monaco as unknown as Monaco,
		setModelMarkers: monaco.editor.setModelMarkers,
		revealLineInCenter: editor.revealLineInCenter,
		setPosition: editor.setPosition,
	};
}

describe('setRecordJsonErrorMarker', () => {
	it('marks the reported spot through the end of its line and scrolls to it', () => {
		const { editor, monaco, model, setModelMarkers, revealLineInCenter, setPosition } = fakeEditor([
			'[',
			'    {',
			'        "city" "London"',
			'    }',
			']',
		]);

		setRecordJsonErrorMarker(editor, monaco, {
			message: "Expected ':' after property name",
			location: { lineNumber: 3, column: 16 },
		});

		expect(setModelMarkers).toHaveBeenCalledTimes(1);
		const [markedModel, owner, markers] = setModelMarkers.mock.calls[0];
		expect(markedModel).toBe(model);
		expect(owner).toBe('record-json');
		expect(markers).toEqual([{
			severity: 8,
			message: "Expected ':' after property name",
			startLineNumber: 3,
			startColumn: 16,
			endLineNumber: 3,
			endColumn: 24, // through the end of the line, so the squiggle has width
		}]);
		expect(revealLineInCenter).toHaveBeenCalledWith(3);
		expect(setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 16 });
	});

	it('clamps a location past the end of the buffer, which would drop the marker silently', () => {
		const { editor, monaco, setModelMarkers, setPosition } = fakeEditor(['{}']);

		setRecordJsonErrorMarker(editor, monaco, {
			message: 'Unexpected end of JSON input',
			location: { lineNumber: 99, column: 99 },
		});

		expect(setModelMarkers.mock.calls[0][2]).toMatchObject([{ startLineNumber: 1, startColumn: 3 }]);
		expect(setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 3 });
	});

	// Some engines report no position at all (V8 for very short inputs, JavaScriptCore always).
	it('clears the previous marker, and leaves the cursor alone, when the error has no location', () => {
		const { editor, monaco, setModelMarkers, revealLineInCenter, setPosition } = fakeEditor(['not json']);

		setRecordJsonErrorMarker(editor, monaco, { message: 'Unexpected token' });

		expect(setModelMarkers.mock.calls[0][2]).toEqual([]);
		expect(revealLineInCenter).not.toHaveBeenCalled();
		expect(setPosition).not.toHaveBeenCalled();
	});

	it('does nothing when the editor has no model', () => {
		const editor = { getModel: () => null } as unknown as RecordEditor;
		const monaco = { MarkerSeverity: { Error: 8 }, editor: { setModelMarkers: vi.fn() } };

		expect(() =>
			setRecordJsonErrorMarker(editor, monaco as unknown as Monaco, {
				message: 'Unterminated string',
				location: { lineNumber: 1, column: 1 },
			})
		).not.toThrow();
		expect(monaco.editor.setModelMarkers).not.toHaveBeenCalled();
	});
});

describe('clearRecordJsonErrorMarker', () => {
	it('clears only this owner, so no other provider loses its diagnostics', () => {
		const { editor, monaco, model, setModelMarkers } = fakeEditor(['{}']);

		clearRecordJsonErrorMarker(editor, monaco);

		expect(setModelMarkers).toHaveBeenCalledWith(model, 'record-json', []);
	});
});
