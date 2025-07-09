import { Editor } from '@monaco-editor/react';
import { useEditorView } from '../../../hooks/useEditorView';
import { Button } from '@/components/ui/button';

export function TextEditorView() {
	const { selectedFile } = useEditorView();

	return (
		<div className="h-full">
			<Button variant="positiveOutline" className="rounded-full">
				Save
			</Button>
			<Editor
				className="w-full h-[500px]"
				language="javascript"
				theme="vs-dark"
				value={selectedFile.content}
				// onChange={(value) => updateEditorContent(value)}
			/>
		</div>
	);
}
