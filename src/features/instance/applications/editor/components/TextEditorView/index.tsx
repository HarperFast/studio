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
	const { selectedFolderFile, onSaveFile, isSavingFile } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useState<string>(selectedFolderFile.content || '');

	const crumbPath = selectedFolderFile.filePath.split('/').slice(1).join('/').replace(/\//g, ' > ');

	useEffect(() => {
		const extension = parseFileExtension(selectedFolderFile.filePath) as keyof typeof extensionToLanguageMap;
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [selectedFolderFile]);

	return (
		<div className="h-full">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{selectedFolderFile.filePath ? crumbPath : 'Select a file'}</span>
				<Button
					variant="positiveOutline"
					className="w-32 rounded-full"
					onClick={() => {
						onSaveFile({
							file: selectedFolderFile.filePath.split('/').slice(2).join('/'),
							payload: updateFileContent,
							project: selectedFolderFile.projectName,
						});
					}}
					disabled={
						!selectedFolderFile.filePath ||
						(selectedFolderFile.filePath && updateFileContent == selectedFolderFile.content) ||
						isSavingFile
					}
				>
					<Save />
					<span className="ms-1">Save</span>
				</Button>
			</div>
			{!selectedFolderFile.filePath ? (
				<div className="flex items-center justify-center h-full">
					<span className="text-white">No file selected</span>
				</div>
			) : (
				<Editor
					className="w-full h-[500px]"
					language={language}
					theme="vs-dark"
					value={selectedFolderFile.content || ''}
					onChange={(updatedValue) => {
						setUpdateFileContent(updatedValue || '');
					}}
					options={{
						automaticLayout: true,
						minimap: { enabled: false },
					}}
				/>
			)}
		</div>
	);
}
