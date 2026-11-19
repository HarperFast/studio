import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { Editor } from '@/lib/monaco/MonacoEditor';
import type { OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { configureHarperConfigEditor, HARPER_CONFIG_MODEL_PATH } from '../harper-config/configMonaco';
import { locateJsonPaths } from '../jsonPathRanges';

export interface ConfigEditorMarker {
	path: string;
	label: string;
	message: string;
}

interface RawConfigEditorProps {
	value: string;
	onChange: (value: string) => void;
	markers: readonly ConfigEditorMarker[];
	readOnly?: boolean;
}

export function RawConfigEditor({ value, onChange, markers, readOnly = false }: RawConfigEditorProps) {
	const monacoTheme = useMonacoTheme();
	const [instance, setInstance] = useState<Parameters<OnMount>[0] | null>(null);
	const markersRef = useRef(markers);
	markersRef.current = markers;

	const handleMount = useCallback<OnMount>(mounted => {
		// Registers the config JSON Schema; deliberately not awaited (`OnMount` is
		// sync, and the editor is usable while the schema lands a microtask later).
		// Catch rather than leave it floating: the dynamic import can reject when a
		// hashed chunk is gone after a redeploy, and an unhandled rejection would say
		// nothing about which editor lost its schema. Recovery for that case is
		// already global (`vite:preloadError` → `reportPossibleStaleDeploy`); this
		// only reports the degradation — config editing still works, without
		// validation or key autocomplete.
		configureHarperConfigEditor().catch((error: unknown) => {
			console.error('Failed to register the Harper config JSON Schema:', error);
		});
		setInstance(mounted);
	}, []);

	useEffect(() => {
		const model = instance?.getModel();
		if (!instance || !model) {
			return;
		}
		const decorations = instance.createDecorationsCollection();
		const mark = () => {
			const byPath = new Map(markersRef.current.map(marker => [marker.path, marker]));
			decorations.set(
				locateJsonPaths(model.getValue(), [...byPath.keys()]).map(({ path, offset, length }) => {
					const marker = byPath.get(path)!;
					const start = model.getPositionAt(offset);
					const end = model.getPositionAt(offset + length);
					return {
						// Through the end of the line, so the note follows the comma rather than splitting value from it.
						range: {
							startLineNumber: start.lineNumber,
							startColumn: start.column,
							endLineNumber: end.lineNumber,
							endColumn: model.getLineMaxColumn(end.lineNumber),
						},
						options: {
							hoverMessage: { value: marker.message },
							after: { content: `  ${marker.label}`, inlineClassName: 'harper-config-note' },
						},
					};
				}),
			);
		};
		mark();
		// Parsing the document is the costly part, so it waits for a pause in typing.
		let pending: ReturnType<typeof setTimeout> | undefined;
		const subscription = model.onDidChangeContent(() => {
			clearTimeout(pending);
			pending = setTimeout(mark, 150);
		});
		return () => {
			clearTimeout(pending);
			subscription.dispose();
			decorations.clear();
		};
	}, [instance, markers]);

	return (
		<Editor
			className="w-full min-h-full h-96"
			path={HARPER_CONFIG_MODEL_PATH}
			language="json"
			theme={monacoTheme}
			onMount={handleMount}
			options={{ readOnly, scrollBeyondLastLine: false }}
			value={value}
			onChange={next => onChange(next ?? '')}
		/>
	);
}
