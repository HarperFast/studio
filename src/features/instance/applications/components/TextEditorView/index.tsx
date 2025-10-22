import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from '@/features/instance/applications/modals/DeleteDirectoryOrFileModal';
import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useToggler } from '@/hooks/useToggler';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { FileIcon, FolderIcon, PackageIcon, PencilIcon, SaveIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './directory-read-me.css';
import Markdown from 'react-markdown';
import { toast } from 'sonner';

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
	const queryClient = useQueryClient();
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
	const {
		toggled: isDeleteDirectoryOrFileClicked,
		toggleOn: onDeleteClick,
		setToggled: setIsDeleteDirectoryOrFileClicked,
	} = useToggler(false);
	const {
		toggled: isRedeployApplicationClicked,
		toggleOn: onRedeployClicked,
		setToggled: setIsRedeployApplicationClicked,
	} = useToggler(false);

	const onHideAddDirectoryModal = useCallback(() => {
		hideAddingDirectory();
		hideAddingFile();
	}, []);

	const { mutate: reDeployApplication, isPending: isDeployComponentPending } = useDeployComponentMutation();

	const redeployPackage = useCallback((applicationUrl: string) => {
		if (!openedEntry) {
			return;
		}
		const originalPackageUrl = openedEntry.package;
		const toastId = toast.loading('Redeploying...');
		reDeployApplication({
			applicationName: openedEntry.project,
			applicationUrl,
			replicated: instanceParams.entityType === 'cluster',
			...instanceParams,
		}, {
			onSuccess: () => {
				toast.success(
					`Application ${openedEntry.project} redeployed successfully`,
					{
						id: toastId,
					},
				);
				void queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'get_components'],
					refetchType: 'active',
				});
				setIsRedeployApplicationClicked(false);
			},
			onError: () => {
				openedEntry.package = originalPackageUrl;
				toast.dismiss(toastId);
			},
		});
	}, [reDeployApplication, openedEntry, instanceParams, queryClient]);

	const restrictPackageModification = useMemo(() => {
		if (!openedEntry) {
			return false;
		}
		return openedEntry.package?.includes('github.com/HarperDB/status-check-fabric')
			|| openedEntry.package?.includes('github.com/HarperFast/status-check-fabric');
	}, [openedEntry?.package]);

	useEffect(() => {
		if (!mountedRef.current || !canManageBrowseInstance) {
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
				run: onDeleteClick,
			}),
		];
		return () => {
			for (const disposable of disposables) {
				disposable?.dispose();
			}
		};
	}, [mountedRef, canManageBrowseInstance, onAddFileClicked, onAddDirectoryClicked, onSaveClick, onRevertChangesClicked, onDeleteClick]);

	if (!openedEntry) {
		return null;
	}

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
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
				>
					<SaveIcon />
					<span className="hidden lg:inline-block"><u>S</u>ave</span>
				</Button>}

				{!openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					// onClick={onRenameClick}
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
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
				/>}

				<div className="grow"></div>

				{!restrictPackageModification && canManageBrowseInstance && <Button
					variant="destructiveGhost"
					className="rounded-none"
					onClick={onDeleteClick}
				>
					<TrashIcon />
					<span className="hidden xl:inline-block"><u>D</u>elete</span>
				</Button>}

				{!isDirectory(openedEntry) && !openedEntry.package && canManageBrowseInstance && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onRevertChangesClicked}
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
				>
					<Undo2Icon />
					<span className="hidden xl:inline-block">Revert Changes</span>
				</Button>}

			</div>

			<AddDirectoryOrFileModal
				isModalOpen={isAddingDirectory || isAddingFile}
				hideModal={onHideAddDirectoryModal}
				type={isAddingDirectory ? 'directory' : 'file'}
			/>
			<DeleteDirectoryOrFileModal
				isModalOpen={isDeleteDirectoryOrFileClicked}
				setIsModalOpen={setIsDeleteDirectoryOrFileClicked}
			/>
			<RedeployApplicationModal
				isModalOpen={isRedeployApplicationClicked}
				setIsModalOpen={setIsRedeployApplicationClicked}
				redeployPackage={redeployPackage}
				isRedeployPackagePending={isDeployComponentPending}
				packageUrl={openedEntry.package}
			/>
		</>
	);
}
