import { Editor } from '@monaco-editor/react';
import { useEditorView } from '../../../hooks/useEditorView';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';

function parseFileExtension(filename: string) {
	const parts = (filename || '')?.split('.');
	return parts.length > 1 ? parts.slice(-1)[0] : '';
}

const extensionToLanguageMap = {
	js: 'javascript',
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
	const { selectedFile, onSaveFile, isSavingFile } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useState<string>(selectedFile.content || '');

	const crumbPath = selectedFile.filePath.split('/').slice(1).join('/').replace(/\//g, ' > ');

	useEffect(() => {
		const extension = parseFileExtension(selectedFile.filePath) as keyof typeof extensionToLanguageMap;
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [selectedFile]);

	return (
		<div className="h-full">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{selectedFile.filePath ? crumbPath : 'Select a file'}</span>
				<Button
					variant="positiveOutline"
					className="w-32 rounded-full"
					onClick={() => {
						onSaveFile({
							file: selectedFile.filePath.split('/').slice(2).join('/'),
							payload: updateFileContent || '',
							project: selectedFile.projectName || '',
						});
					}}
					disabled={
						!selectedFile.filePath ||
						(selectedFile.filePath && updateFileContent == selectedFile.content) ||
						isSavingFile
					}
				>
					<Save />
					<span className="ms-1">Save</span>
				</Button>
			</div>
			<Editor
				className="w-full h-[500px]"
				language={language}
				theme="vs-dark"
				value={selectedFile.content || ''}
				onChange={(updatedValue) => {
					setUpdateFileContent(updatedValue || '');
				}}
				options={{
					automaticLayout: true,
					minimap: { enabled: false },
				}}
			/>
		</div>
	);
}
