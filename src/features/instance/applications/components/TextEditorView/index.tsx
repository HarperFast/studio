import { RestartButton } from '@/components/RestartButton';
import { Button } from '@/components/ui/button';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { AddFolderFileModal } from '@/features/instance/applications/modals/AddFolderFileModal';
import { DeleteFolderFileModal } from '@/features/instance/applications/modals/DeleteFolderFileModal';
import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
import { useDeleteComponentFolderFile } from '@/features/instance/operations/mutations/deleteComponentFolderFile';
import { useDeployComponentMutation } from '@/features/instance/operations/mutations/deployComponent';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useToggler } from '@/hooks/useToggler';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { Editor, EditorProps, OnMount } from '@monaco-editor/react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { FileIcon, FolderIcon, PackageIcon, PencilIcon, SaveIcon, TrashIcon, Undo2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

	const mountedRef = useRef<Parameters<OnMount> | null>(null);

	// TODO: Split all this logic up into smaller files, right?

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

	const onDiscardClick = useCallback(() => {
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

	useEffect(() => {
		if (!mountedRef.current) {
			return;
		}
		const [editor, monaco] = mountedRef.current;
		const disposables = [
			editor.addAction({
				id: 'save-file',
				label: 'Save Changes',
				keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
				run: onSaveClick,
			}),
			editor.addAction({
				id: 'revert-file',
				label: 'Revert File',
				run: onDiscardClick,
			}),
		];
		return () => {
			for (const disposable of disposables) {
				disposable?.dispose();
			}
		};
	}, [mountedRef, onSaveClick, onDiscardClick]);

	const {
		toggled: isAddFolderOrFileClicked,
		toggleOn: onNewFileClick,
		setToggled: setIsAddFolderOrFileClicked,
	} = useToggler(false);
	const { toggled: isAddingFolder, toggleOn: setIsAddingFolder } = useToggler(false);
	const { toggled: isDeleteFolderOrFileClicked, setToggled: setIsDeleteFolderOrFileClicked } = useToggler(false);
	const { toggled: isRedeployApplicationClicked, setToggled: setIsRedeployApplicationClicked } = useToggler(false);
	const { mutate: deleteFolderFile, isPending: isDeleteFolderFilePending } = useDeleteComponentFolderFile();

	const handleDeleteFolderOrFile = useCallback(async () => {
		if (!openedEntry) {
			return;
		}
		deleteFolderFile(
			{
				file: openedEntry.package
					? undefined
					: `${openedEntry.path.split('/').slice(1).join('/')}`,
				project: openedEntry.project,
				replicated: instanceParams.entityType === 'cluster',
				...instanceParams,
			},
			{
				onSuccess: () => {
					// TODO: Select parent.
					// setOpenedEntry({
					// 	filePath: '',
					// 	projectName: '',
					// 	entries: [],
					// 	content: '',
					// 	pkg: '',
					// });
					// refetchComponents();
					setIsDeleteFolderOrFileClicked(false);
				},
			},
		);
	}, [deleteFolderFile, instanceParams, openedEntry]);

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
	// TODO:
	// const restrictPackageModification = useMemo(() => {
	// 	return openedEntry.package?.includes('github.com/HarperDB/status-check-fabric')
	// 		|| openedEntry.package?.includes('github.com/HarperFast/status-check-fabric');
	// }, [openedEntry.package]);


	const onDeleteClick = useCallback(() => {
		setIsDeleteFolderOrFileClicked(true);
	}, []);

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
								readOnly: !!openedEntry.package,
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

				{!isDirectory(openedEntry) && <Button
					variant="default"
					className="rounded-none"
					onClick={onSaveClick}
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
					accessKey="s"
				>
					<SaveIcon />
					<span className="hidden lg:inline-block"><u>S</u>ave</span>
				</Button>}

				<Button
					variant="ghost"
					className="rounded-none"
					// onClick={onRenameClick}
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
					accessKey="s"
				>
					<PencilIcon />
					<span className="hidden lg:inline-block"><u>R</u>ename</span>
				</Button>

				<Button
					variant="ghost"
					className="rounded-none"
					onClick={onNewFileClick}
					accessKey="n"
				>
					<FileIcon />
					<span className="hidden lg:inline-block"><u>N</u>ew File</span>
				</Button>

				<Button
					variant="ghost"
					className="rounded-none"
					onClick={setIsAddingFolder}
					accessKey="n"
				>
					<FolderIcon />
					<span className="hidden lg:inline-block"><u>A</u>dd Directory</span>
				</Button>

				{openedEntry.package && <Button
					variant="ghost"
					className="rounded-none"
					// onClick={onRedeplyClick}
					accessKey="n"
				>
					<PackageIcon />
					<span>Redeploy <u>P</u>ackage</span>
				</Button>}

				<RestartButton
					targetNoun={targetNoun}
					instanceClient={instanceParams.instanceClient}
					operation="restart_service"
					variant="ghost"
					className="rounded-none"
				/>

				<div className="grow"></div>

				<Button
					variant="destructiveGhost"
					className="rounded-none"
					onClick={onDeleteClick}
					accessKey="n"
				>
					<TrashIcon />
					<span className="hidden xl:inline-block"><u>D</u>elete</span>
				</Button>

				{!isDirectory(openedEntry) && <Button
					variant="ghost"
					className="rounded-none"
					onClick={onDiscardClick}
					disabled={
						updateFileContent === undefined ||
						updateFileContent === openedEntryContents ||
						isSavingFile
					}
					accessKey="d"
				>
					<Undo2Icon />
					<span className="hidden xl:inline-block"><u>D</u>iscard Changes</span>
				</Button>}

			</div>

			<AddFolderFileModal
				isModalOpen={isAddFolderOrFileClicked}
				setIsModalOpen={setIsAddFolderOrFileClicked}
				isAddingFolder={isAddingFolder}
			/>
			<DeleteFolderFileModal
				isModalOpen={isDeleteFolderOrFileClicked}
				setIsModalOpen={setIsDeleteFolderOrFileClicked}
				isFolderSelected={isDirectory(openedEntry)}
				isPackageSelected={!!openedEntry.package}
				isPending={isDeleteFolderFilePending}
				handleDeleteFolderOrFile={handleDeleteFolderOrFile}
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
