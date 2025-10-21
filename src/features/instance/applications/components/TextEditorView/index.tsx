import { Button } from '@/components/ui/button';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useEffectedState } from '@/hooks/useEffectedState';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor } from '@monaco-editor/react';
import { SaveIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import './directory-read-me.css';
import Markdown from 'react-markdown';

const extensionToLanguageMap: Record<string, string> = {
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
	const instanceParams = useInstanceClientParams();
	const { openedEntryContents, openedEntry, saveFile, isSavingFile } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | undefined>(
		openedEntryContents || undefined,
		[openedEntryContents],
	);

	useEffect(() => {
		const extension = parseFileExtension(openedEntry?.path);
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [openedEntry]);

	const onSaveClick = useCallback(() => {
		if (openedEntry && updateFileContent !== undefined) {
			saveFile(
				{
					...instanceParams,
					file: openedEntry.path.split('/').slice(1).join('/'),
					payload: updateFileContent,
					project: openedEntry.project,
				},
				openedEntry.path,
			);
		}
	}, [updateFileContent, saveFile, instanceParams, openedEntry]);

	if (!openedEntry) {
		return null;
	}

	return (
		<>
			{openedEntryContents && <>
				{!isDirectory(openedEntry)
					? (<Editor
							className="w-full min-h-full h-80"
							language={language}
							theme="vs-dark"
							value={openedEntryContents || ''}
							onChange={setUpdateFileContent}
							options={{
								automaticLayout: true,
								minimap: { enabled: false },
								readOnly: !!openedEntry.package,
							}}
						/>
					)
					: (<div className="directoryReadMe max-w-4xl">
						<Markdown>
							{openedEntryContents}
						</Markdown>
					</div>)}
			</>}

			<div className="fixed bottom-4 right-4">
				<Button
					variant="positiveOutline"
					className="w-38 rounded-full"
					onClick={onSaveClick}
					disabled={
						!openedEntry.path ||
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
				>
					<SaveIcon />
					<span className="ms-1">Save</span>
				</Button>
			</div>
		</>
	);
}
