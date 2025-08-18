import { Editor } from '@monaco-editor/react';
import { useEditorView } from '../../../hooks/useEditorView';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useUpdateRestartInstance } from '@/features/instance/operations/mutations/updateRestartInstance';
import { toast } from 'sonner';
import { useParams } from '@tanstack/react-router';

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
	const [updateFileContent, setUpdateFileContent] = useState<string>(selectedFolderFile.content || '');
	const { clusterId, instanceId } = useParams({ strict: false });
	const targetId = instanceId ?? clusterId;
	const targetNoun = instanceId ? 'Instance' : 'Cluster';
	const { mutate: restartInstance, isPending: isRestartInstancePending } = useUpdateRestartInstance();

	const crumbPath = selectedFolderFile.filePath.split('/').slice(1).join('/').replace(/\//g, ' > ');

	const restartingInstance = () => {
		const toastId = toast.loading('Restarting', {
			description: `Restarting ${targetNoun.toLowerCase()}. This may take up to 60 seconds.`,
			duration: 60000, // Keep the toast open until dismissed
			action: {
				label: 'Dismiss',
				onClick: () => toast.dismiss(),
			},
		});
		restartInstance(targetId, {
			onSuccess: () => {
				toast.dismiss(toastId);
				toast.success('Success', {
					description: `${targetNoun} restarted!`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
			onError: () => {
				toast.error('Error', {
					description: `Failed to restart ${targetNoun.toLowerCase()}.`,
					action: {
						label: 'Dismiss',
						onClick: () => toast.dismiss(),
					},
				});
			},
		});
	};

	useEffect(() => {
		const extension = parseFileExtension(selectedFolderFile.filePath) as keyof typeof extensionToLanguageMap;
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [selectedFolderFile]);

	return (
		<div className="h-full">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{selectedFolderFile.filePath ? crumbPath : 'Select a file'}</span>
				<div>
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
					<Button
						variant="defaultOutline"
						className="ml-4 rounded-full cursor-pointer"
						onClick={restartingInstance}
						disabled={isRestartInstancePending}
					>
						Restart {targetNoun}
					</Button>
				</div>
			</div>
			{!selectedFolderFile.filePath || isFolder(selectedFolderFile.entries) ? (
				<div className="flex items-center justify-center h-full">
					<span className="text-white">No file selected</span>
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
					}}
				/>
			)}
		</div>
	);
}
