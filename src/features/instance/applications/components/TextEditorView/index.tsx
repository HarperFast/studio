import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { NewApplicationModal } from '@/features/instance/applications/modals/NewApplicationModal';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useToggler } from '@/hooks/useToggler';
import { Editor } from '@monaco-editor/react';
import { useParams } from '@tanstack/react-router';
import { PlusIcon, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import './directory-read-me.css';

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
	const { selectedFolderFile, onSaveFile, isSavingFile, isFolder } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | undefined>(
		selectedFolderFile.content || undefined,
		[selectedFolderFile.filePath],
	);
	const { instanceId }: { instanceId: string } = useParams({ strict: false });
	const targetNoun = instanceId || isLocalStudio ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientParams();
	const {
		toggled: isNewApplicationModalOpen,
		setToggled: setIsNewApplicationModalOpen,
		toggleOn: openApplicationModal,
	} = useToggler(false);
	const [appType, setAppType] = useState<'create' | 'import'>('create');

	const crumbPath = selectedFolderFile.filePath.split('/').slice(1).join('/').replace(/\//g, ' > ');

	useEffect(() => {
		const extension = parseFileExtension(selectedFolderFile.filePath) as keyof typeof extensionToLanguageMap;
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [selectedFolderFile]);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const onSaveClick = useCallback(() => {
		if (updateFileContent !== undefined) {
			onSaveFile(
				{
					...instanceParams,
					file: selectedFolderFile.filePath.split('/').slice(2).join('/'),
					payload: updateFileContent,
					project: selectedFolderFile.projectName,
				},
				selectedFolderFile.filePath,
			);
		}
	}, [updateFileContent, onSaveFile, instanceParams, selectedFolderFile.filePath, selectedFolderFile.projectName]);

	return (
		<div className="h-[calc(100vh-theme(spacing.52))]">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{selectedFolderFile.filePath ? crumbPath : 'Select a file'}</span>
				{!selectedFolderFile.pkg && canManageBrowseInstance && (
					<div className="flex flex-col justify-end space-y-2 md:justify-normal md:flex-row">
						<Button
							variant="positiveOutline"
							className="w-38 rounded-full"
							onClick={onSaveClick}
							disabled={
								!selectedFolderFile.filePath ||
								updateFileContent === undefined ||
								updateFileContent === selectedFolderFile.content ||
								isSavingFile
							}
						>
							<Save />
							<span className="ms-1">Save</span>
						</Button>
						<RestartButton
							targetNoun={targetNoun}
							instanceClient={instanceParams.instanceClient}
							operation="restart_service"
						/>

						<Button variant="defaultOutline" className="w-38 rounded-full" onClick={openApplicationModal}>
							<PlusIcon /> New Application
						</Button>
					</div>
				)}
			</div>

			{selectedFolderFile.filePath && <>

				{!isFolder(selectedFolderFile.entries) && <Editor
					className="w-full min-h-full h-80"
					language={language}
					theme="vs-dark"
					value={selectedFolderFile.content || ''}
					onChange={setUpdateFileContent}
					options={{
						automaticLayout: true,
						minimap: { enabled: false },
						readOnly: !!selectedFolderFile.pkg,
					}}
				/>}

				{selectedFolderFile.directoryReadMe?.content && <div className="directoryReadMe max-w-4xl">
					<Markdown>
						{selectedFolderFile.directoryReadMe.content}
					</Markdown>
				</div>}

			</>}

			<NewApplicationModal
				isModalOpen={isNewApplicationModalOpen}
				setIsModalOpen={setIsNewApplicationModalOpen}
				appType={appType}
				setAppType={setAppType}
			/>
		</div>
	);
}
