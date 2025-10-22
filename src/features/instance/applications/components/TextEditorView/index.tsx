import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { RenameFileModal } from '@/features/instance/applications/modals/RenameFileModal';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useToggler } from '@/hooks/useToggler';
import { currySetWatchedValue, useSetWatchedValue } from '@/hooks/useWatchedValue';
import { WatchedValueKeys } from '@/lib/storage/watchedValueKeys';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useParams } from '@tanstack/react-router';
import { FileIcon, FolderIcon, PackageIcon, PencilIcon, SaveIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
	const { instanceId }: { instanceId?: string; clusterId?: string; } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const { openedEntryContents, openedEntry, saveFile, isSavingFile } = useEditorView();
	const [language, setLanguage] = useState('javascript');
	const [updateFileContent, setUpdateFileContent] = useEffectedState<string | undefined>(
		openedEntryContents || undefined,
		[openedEntryContents],
	);
	const targetNoun = instanceId || isLocalStudio ? 'Instance' : 'Cluster';
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const mountedRef = useRef<Parameters<OnMount> | null>(null);

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

	const onRevertChangesClicked = useCallback(() => {
		if (openedEntryContents) {
			setUpdateFileContent(openedEntryContents);
		}
		if (mountedRef.current) {
			const [editor] = mountedRef.current;
			editor.setValue(openedEntryContents || '');
		}
	}, [openedEntryContents]);

	const handleEditorDidMount: EditorProps['onMount'] = useCallback<OnMount>((editor, monaco) => {
		mountedRef.current = [editor, monaco];
	}, [mountedRef, onSaveClick]);

	const {
		toggled: isAddingDirectory,
		toggleOn: onAddDirectoryClicked,
		toggleOff: hideAddingDirectory,
	} = useToggler(false);
	const { toggled: isAddingFile, toggleOn: onAddFileClicked, toggleOff: hideAddingFile } = useToggler(false);
	const { toggled: isRenamingFile, toggleOn: onRenameClick, toggleOff: onHideRenamingFileModal } = useToggler(false);

	const onHideAddDirectoryModal = useCallback(() => {
		hideAddingDirectory();
		hideAddingFile();
	}, []);

	const restrictPackageModification = useMemo(() => {
		if (!openedEntry) {
			return false;
		}
		return openedEntry.package?.includes('github.com/HarperDB/status-check-fabric')
			|| openedEntry.package?.includes('github.com/HarperFast/status-check-fabric');
	}, [openedEntry?.package]);

	const onDeleteClick = useSetWatchedValue(WatchedValueKeys.ShowDeleteDirectoryOrFileModal, true);
	const onRedeployClicked = useSetWatchedValue(WatchedValueKeys.ShowRedeployApplicationModal, true);

	useEffect(() => {
		if (!mountedRef.current || !canManageBrowseInstance || !!openedEntry?.package) {
			return;
		}
		const [editor, monaco] = mountedRef.current;
		const disposables = [
			editor.addAction({
				id: 'new-file',
				label: 'New File',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.KeyN],
				run: onAddFileClicked,
			}),
			editor.addAction({
				id: 'rename-file',
				label: 'Rename File',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyCode.KeyR],
				run: onRenameClick,
			}),
			editor.addAction({
				id: 'new-directory',
				label: 'New Directory',
				keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyN],
				run: onAddDirectoryClicked,
			}),
			editor.addAction({
				id: 'save-file',
				label: 'Save Changes',
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
				run: onSaveClick,
			}),
			editor.addAction({
				id: 'revert-file',
				label: 'Revert File',
				run: onRevertChangesClicked,
			}),
			editor.addAction({
				id: 'delete-file',
				label: 'Delete File',
				run: currySetWatchedValue(WatchedValueKeys.ShowDeleteDirectoryOrFileModal, true),
			}),
		];
		return () => {
			for (const disposable of disposables) {
				disposable?.dispose();
			}
		};
	}, [mountedRef, canManageBrowseInstance, openedEntry, onAddFileClicked, onRenameClick, onAddDirectoryClicked, onSaveClick, onRevertChangesClicked]);

	if (!openedEntry) {
		return null;
	}

	const fileIsClean = updateFileContent === undefined || updateFileContent === openedEntryContents;

	return (
		<>
			{openedEntryContents !== undefined && <>
				{!isDirectory(openedEntry)
					? (<Editor
							className="w-full min-h-full h-80"
							language={language}
							theme="vs-dark"
							value={openedEntryContents || ''}
							onMount={handleEditorDidMount}
							onChange={setUpdateFileContent}
							options={{
								automaticLayout: true,
								minimap: { enabled: false },
								readOnly: !!openedEntry.package || !canManageBrowseInstance,
								padding: { top: 50 },
							}}
						/>
					)
					: (<div className="directoryReadMe max-w-4xl">
						<Markdown>
							{openedEntryContents}
						</Markdown>
					</div>)}
			</>}

			<div className="absolute top-0 right-0 left-0 backdrop-blur-sm bg-black-10 shadow-xl flex pr-12 -mr-1">

				{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
					variant="default"
					className="rounded-none"
					onClick={onSaveClick}
					disabled={fileIsClean || isSavingFile}
				>
					<SaveIcon />
					<span className="hidden lg:inline-block"><u>S</u>ave</span>
				</Button>}

				{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onRenameClick}
					disabled={!fileIsClean || isSavingFile}
				>
					<PencilIcon />
					<span className="hidden lg:inline-block"><u>R</u>ename</span>
				</Button>}

				{!openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onAddFileClicked}
				>
					<FileIcon />
					<span className="hidden lg:inline-block"><u>N</u>ew File</span>
				</Button>}

				{!openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onAddDirectoryClicked}
				>
					<FolderIcon />
					<span className="hidden lg:inline-block"><u>A</u>dd Directory</span>
				</Button>}

				{!!openedEntry.package && canManageBrowseInstance && !restrictPackageModification && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onRedeployClicked}
				>
					<PackageIcon />
					<span>Redeploy <u>P</u>ackage</span>
				</Button>}

				{canManageBrowseInstance && <RestartButton
					targetNoun={targetNoun}
					instanceClient={instanceParams.instanceClient}
					operation="restart_service"
					variant="ghost"
					className="rounded-none"
					disabled={!fileIsClean || isSavingFile}
				/>}

				<div className="grow"></div>


				{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onRevertChangesClicked}
					disabled={fileIsClean || isSavingFile}
				>
					<Undo2Icon />
					<span className="hidden xl:inline-block">Revert Changes</span>
				</Button>}

				{!restrictPackageModification && canManageBrowseInstance && <Button
					variant="destructiveGhost"
					className="rounded-none"
					onClick={onDeleteClick}
				>
					<TrashIcon />
					<span className="hidden xl:inline-block"><u>D</u>elete</span>
				</Button>}
			</div>

			<AddDirectoryOrFileModal
				isModalOpen={isAddingDirectory || isAddingFile}
				hideModal={onHideAddDirectoryModal}
				type={isAddingDirectory ? 'directory' : 'file'}
			/>
			<RenameFileModal
				isModalOpen={isRenamingFile}
				hideModal={onHideRenamingFileModal}
			/>
		</>
	);
}
