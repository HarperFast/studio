import { Editor } from '@monaco-editor/react';
import { useEditorView } from '../../../hooks/useEditorView';

export function TextEditorView() {
	const { selectedFile } = useEditorView();

	return (
		<Editor
			className="w-full h-96"
			language="javascript"
			theme="vs-dark"
			value={selectedFile.content}
			// onChange={(value) => updateEditorContent(value)}
		/>
	);
}
