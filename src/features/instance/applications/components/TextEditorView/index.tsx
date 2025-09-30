import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { useEffectedState } from '@/hooks/useEffectedState';
import { Editor } from '@monaco-editor/react';
import { useParams } from '@tanstack/react-router';
import { ImportIcon, PlusIcon, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { NewApplicationModal } from '@/features/instance/applications/modals/NewApplicationModal';

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
	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | null>(
		selectedFolderFile.content || null,
		[selectedFolderFile.filePath]
	);
	const { instanceId }: { instanceId: string } = useParams({ strict: false });
	const targetNoun = instanceId || isLocalStudio ? 'Instance' : 'Cluster';
	const instanceParams = useInstanceClientParams();
	const [isNewApplicationModalOpen, setIsNewApplicationModalOpen] = useState(false);
	const [appType, setAppType] = useState<'create' | 'import'>('create');

	const crumbPath = selectedFolderFile.filePath.split('/').slice(1).join('/').replace(/\//g, ' > ');

	useEffect(() => {
		const extension = parseFileExtension(selectedFolderFile.filePath) as keyof typeof extensionToLanguageMap;
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [selectedFolderFile]);

	return (
		<div className="h-[calc(100vh-theme(spacing.52))]">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{selectedFolderFile.filePath ? crumbPath : 'Select a file'}</span>
				{!selectedFolderFile.pkg && (
					<div className="flex flex-col justify-end space-y-2 md:justify-normal md:flex-row">
						<Button
							variant="positiveOutline"
							className="w-38 rounded-full"
							onClick={() => {
								if (updateFileContent !== null) {
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
							}}
							disabled={
								!selectedFolderFile.filePath ||
								updateFileContent === null ||
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

						<Button variant="defaultOutline" className="w-38 rounded-full" onClick={() => setIsNewApplicationModalOpen(true)}>
							<PlusIcon /> New Application
						</Button>
					</div>
				)}
			</div>
			{!selectedFolderFile.filePath || isFolder(selectedFolderFile.entries) ? (
				<div className="flex flex-col items-center justify-center h-full space-y-4">
					<span className="text-white">No file selected</span>
					<div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
						<Button variant="positiveOutline" className="ms-4" size="lg" onClick={() => {
							setIsNewApplicationModalOpen(true);
							setAppType('create');
							}}>
							<PlusIcon /> Create New Application
						</Button>
						<Button variant="defaultOutline" className="ms-4" size="lg" onClick={() => {
							setIsNewApplicationModalOpen(true);
							setAppType('import');
						}}>
							<ImportIcon /> Import Application
						</Button>
					</div>
				</div>
			) : (
				<Editor
					className="w-full min-h-full h-80"
					language={language}
					theme="vs-dark"
					value={selectedFolderFile.content || ''}
					onChange={(updatedValue) => {
						setUpdateFileContent(updatedValue || '');
					}}
					options={{
						automaticLayout: true,
						minimap: { enabled: false },
						readOnly: !!selectedFolderFile.pkg,
					}}
				/>
			)}
			<NewApplicationModal isModalOpen={isNewApplicationModalOpen} setIsModalOpen={setIsNewApplicationModalOpen} appType={appType} setAppType={setAppType} />
		</div>
	);
}
