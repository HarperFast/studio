import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { NewApplicationModal } from '@/features/instance/applications/modals/NewApplicationModal';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useToggler } from '@/hooks/useToggler';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor } from '@monaco-editor/react';
import { useParams } from '@tanstack/react-router';
import { PlusIcon, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import './directory-read-me.css';

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
	const { openedEntryContents, openedEntry, saveFile, isSavingFile } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | undefined>(
		openedEntryContents || undefined,
		[openedEntryContents],
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

	const crumbPath = openedEntry?.path.split('/').join('/').replace(/\//g, ' > ');

	useEffect(() => {
		const extension = parseFileExtension(openedEntry?.path);
		const updatedLanguage = extensionToLanguageMap[extension] || 'plaintext';
		setLanguage(updatedLanguage);
	}, [openedEntry]);

	const canManageBrowseInstance = useInstanceBrowseManagePermission();

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
		<div className="h-[calc(100vh-theme(spacing.52))]">
			<div className="flex items-center justify-between py-1 border-b border-gray-700">
				<span className="p-2">{openedEntry.path ? crumbPath : 'Select a file'}</span>
				{!openedEntry.package && canManageBrowseInstance && (
					<div className="flex flex-col justify-end space-y-2 md:justify-normal md:flex-row">
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

			{openedEntryContents && <>
				{!isDirectory(openedEntry) && <Editor
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
				/>}

				{/*{openedEntry.directoryReadMe?.content && <div className="directoryReadMe max-w-4xl">*/}
				{/*	<Markdown>*/}
				{/*		{openedEntry.directoryReadMe.content}*/}
				{/*	</Markdown>*/}
				{/*</div>}*/}

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
