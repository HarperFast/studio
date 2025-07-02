// NOTE: disabling because there are callbacks here that haven't been implemented.
import React, { useState } from 'react';
import { Col, Row } from 'reactstrap';
import FileBrowser from './FileBrowser';
import Editor from './Editor';
import EditorWindow, {
	EDITOR_WINDOWS,
	PackageInstallWindow,
	DefaultWindow,
	DefaultFolderWindow,
	NameFileWindow,
	DeleteFileWindow,
	DeleteFolderWindow,
	DeletePackageWindow,
	NameProjectFolderWindow,
	NameProjectWindow,
} from './EditorWindow';

import FileMenu, {
	AddFileButton,
	AddProjectFolderButton,
	AddProjectButton,
	DeleteFolderButton,
	DeleteFileButton,
} from './FileMenu';

import EditorMenu, { SaveButton, RestartInstanceButton, RestartOnSaveToggle, RevertFileButton } from './EditorMenu';
import { clearTableDescriptionCache } from '../../../../../functions/instance/state/describeTableCache';

// TODO:
//
// - tie editor state into urls to enable deep-linking and navigation
// - revisit the nuances of windowing behavior

function WebIDE({
	deployTargets, // FIXME: does this belong here?
	fileTree,
	onFileSave,
	onAddFile,
	onRevertFile,
	onAddProjectFolder,
	onAddProject,
	onFileChange,
	onDeleteFolder,
	onDeleteFile,
	onDeletePackage,
	onDeployProject,
	onFileSelect,
	onInstallPackage,
	restartInstance,
	restartingInstance,
}) {
	const [selectedFolder, setSelectedFolder] = useState(null);
	const [selectedFile, setSelectedFile] = useState(null); // selectedFile = { content, path: /components/project/rest/of/path.js, project }
	const [selectedPackage, setSelectedPackage] = useState(null); // selectedPackage = { name, url }
	const [activeEditorWindow, setActiveEditorWindow] = useState(EDITOR_WINDOWS.DEFAULT_WINDOW);
	const [previousActiveEditorWindow, setPreviousActiveEditorWindow] = useState(null);
	const [restartAfterSave, setRestartAfterSave] = useState(true);
	const [revertingFile, setRevertingFile] = useState(false);
	const [savingFile, setSavingFile] = useState(false);

	const hasProjects = fileTree?.entries?.length > 0;
	const canAddFile = Boolean(hasProjects && selectedFolder); // can only add a file if a target folder is selected
	const canDeleteFolder = Boolean(hasProjects && (selectedFolder || selectedPackage)); // can only delete a folder if a target folder is selected
	const canAddProjectFolder = Boolean(selectedFolder); // can only add a folder to a project if a target folder is selected

	function updateActiveEditorWindow(to, from) {
		// TODO: figure out correct logic here.
		setActiveEditorWindow(to);
		setPreviousActiveEditorWindow(from);
	}

	function resetSelections() {
		setSelectedPackage(null);
		setSelectedFolder(null);
		setSelectedFile(null);
	}

	function toDefaultWindow() {
		updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
	}

	async function addProject(newProjectName) {
		await onAddProject(newProjectName);
		updateActiveEditorWindow(previousActiveEditorWindow, activeEditorWindow);
	}

	async function addProjectFolder(newFolderName) {
		await onAddProjectFolder(newFolderName, selectedFolder);
		updateActiveEditorWindow(previousActiveEditorWindow, activeEditorWindow);
	}

	async function installPackage(packageUrl, projectName, packageDeployTargets) {
		await onInstallPackage(packageUrl, projectName, packageDeployTargets);
		setSelectedPackage(null);
		updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
	}

	async function addFile(newFilename) {
		const fileInfo = await onAddFile(newFilename, selectedFolder);
		setSelectedFile(fileInfo);
		updateActiveEditorWindow(EDITOR_WINDOWS.CODE_EDITOR_WINDOW, activeEditorWindow);
	}

	// updates current in-memory code
	function updateFileInMemory(updatedCode) {
		const update = {
			...selectedFile,
			content: updatedCode,
		};
		setSelectedFile(update);
	}

	return (
		<Row id="webide">
			<Col md="4" xl="3" className="file-browser-outer-container mb-3">
				<div className="floating-card-header-row">
					<FileMenu>
						<AddProjectButton
							onClick={() => updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow)}
							text="app"
						/>
						{(canAddProjectFolder || canDeleteFolder) && <span className="px-1">|</span>}
						{canAddProjectFolder && (
							<AddProjectFolderButton
								disabled={!canAddProjectFolder}
								onClick={() => updateActiveEditorWindow(EDITOR_WINDOWS.NAME_PROJECT_FOLDER_WINDOW, activeEditorWindow)}
								text={!canDeleteFolder && 'folder'}
							/>
						)}
						{canDeleteFolder && (
							<DeleteFolderButton
								disabled={!canDeleteFolder}
								onClick={() => {
									if (selectedPackage) {
										updateActiveEditorWindow(EDITOR_WINDOWS.DELETE_PACKAGE_WINDOW, activeEditorWindow);
									} else if (selectedFolder) {
										updateActiveEditorWindow(EDITOR_WINDOWS.DELETE_FOLDER_WINDOW, activeEditorWindow);
									}
								}}
								text="folder"
							/>
						)}
						{(canAddFile || selectedFile?.path) && <span className="px-1">|</span>}
						{canAddFile && (
							<AddFileButton
								onClick={() => updateActiveEditorWindow(EDITOR_WINDOWS.NAME_FILE_WINDOW, activeEditorWindow)}
								disabled={!canAddFile}
								text={!selectedFile?.path && 'file'}
							/>
						)}
						{selectedFile?.path && (
							<DeleteFileButton
								disabled={!selectedFile?.path}
								onClick={() => updateActiveEditorWindow(EDITOR_WINDOWS.DELETE_FILE_WINDOW, activeEditorWindow)}
								text={!canAddFile && 'file'}
							/>
						)}
					</FileMenu>
				</div>
				<FileBrowser
					files={fileTree}
					root={fileTree.path}
					selectedFile={selectedFile?.path}
					selectedFolder={selectedFolder}
					selectedPackage={selectedPackage}
					onDeployProject={onDeployProject}
					onFolderSelect={(folder) => {
						resetSelections();
						setSelectedFolder(folder);
						if (!folder) {
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
						} else {
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_FOLDER_WINDOW, activeEditorWindow);
						}
					}}
					onPackageSelect={(pkg) => {
						resetSelections();
						setSelectedPackage(pkg);
						if (!pkg) {
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
						} else {
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_FOLDER_WINDOW, activeEditorWindow);
						}
					}}
					onFileSelect={async (entry) => {
						const unselectAction = !entry;
						resetSelections();

						if (unselectAction) {
							setSelectedFile(null);
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
						} else {
							const fileMeta = await onFileSelect(entry);
							const { content, cached } = fileMeta;
							setSelectedFile({ ...entry, content, cached });
							updateActiveEditorWindow(EDITOR_WINDOWS.CODE_EDITOR_WINDOW, activeEditorWindow);
						}
					}}
				/>
			</Col>
			<Col md="8" xl="9" className="editor-window-container">
				<Row className="floating-card-header-row g-0">
					<Col className="text-nowrap">
						{selectedFile && (
							<>
								{selectedFile?.path?.split('/')?.slice(1)?.join(' > ')}{' '}
								<span className="text-grey d-none d-xl-inline-block">
									| {selectedFile?.size || '...'} bytes |{' '}
									{selectedFile?.mtime ? new Date(selectedFile.mtime).toLocaleTimeString() : '...'}
								</span>
							</>
						)}
					</Col>
					<Col className="text-nowrap">
						<EditorMenu>
							<SaveButton
								savingFile={savingFile}
								disabled={!(selectedFile?.cached && activeEditorWindow === EDITOR_WINDOWS.CODE_EDITOR_WINDOW)}
								onClick={async () => {
									setSavingFile(true);
									await onFileSave(selectedFile, restartAfterSave);
									setSavingFile(false);
								}}
								text="save"
							/>
							<RevertFileButton
								loading={revertingFile}
								disabled={!(selectedFile?.cached && activeEditorWindow === EDITOR_WINDOWS.CODE_EDITOR_WINDOW)}
								onClick={async () => {
									setRevertingFile(true);
									try {
										const updatedContent = await onRevertFile(selectedFile);
										const updatedSelectedFile = {
											...selectedFile,
											content: updatedContent,
											cached: false,
										};
										setSelectedFile(updatedSelectedFile);
									} finally {
										setRevertingFile(false);
									}
								}}
								text="revert"
							/>
							<span className="px-1">|</span>
							<RestartInstanceButton restarting={restartingInstance} onClick={restartInstance} text="restart" />
							<RestartOnSaveToggle
								restartAfterSave={restartAfterSave}
								onClick={() => setRestartAfterSave(!restartAfterSave)}
								text="auto"
							/>
						</EditorMenu>
					</Col>
				</Row>
				<EditorWindow>
					<DefaultWindow
						fileTree={fileTree}
						active={activeEditorWindow === EDITOR_WINDOWS.DEFAULT_WINDOW}
						AddProjectButtonClick={() =>
							updateActiveEditorWindow(EDITOR_WINDOWS.NAME_PROJECT_WINDOW, activeEditorWindow)
						}
						InstallPackageButtonClick={() => {
							setSelectedPackage(null);
							updateActiveEditorWindow(EDITOR_WINDOWS.INSTALL_PACKAGE_WINDOW, activeEditorWindow);
						}}
					/>

					<DefaultFolderWindow
						active={activeEditorWindow === EDITOR_WINDOWS.DEFAULT_FOLDER_WINDOW}
						type={selectedPackage ? 'package' : selectedFolder ? 'folder' : 'nothing'}
					/>

					<NameProjectWindow
						active={activeEditorWindow === EDITOR_WINDOWS.NAME_PROJECT_WINDOW}
						onConfirm={(newProjectName) => {
							addProject(newProjectName);
							clearTableDescriptionCache();
						}}
						onCancel={toDefaultWindow}
					/>

					<NameProjectFolderWindow
						projectName={selectedFolder?.project}
						active={activeEditorWindow === EDITOR_WINDOWS.NAME_PROJECT_FOLDER_WINDOW}
						selectedFolder={selectedFolder}
						onConfirm={addProjectFolder}
						onCancel={toDefaultWindow}
					/>

					<NameFileWindow
						active={activeEditorWindow === EDITOR_WINDOWS.NAME_FILE_WINDOW}
						onConfirm={addFile}
						onCancel={toDefaultWindow}
					/>

					<PackageInstallWindow
						active={activeEditorWindow === EDITOR_WINDOWS.INSTALL_PACKAGE_WINDOW}
						onConfirm={installPackage}
						onCancel={toDefaultWindow}
						deployTargets={deployTargets}
						selectedPackage={selectedPackage}
					/>

					<DeletePackageWindow
						active={activeEditorWindow === EDITOR_WINDOWS.DELETE_PACKAGE_WINDOW}
						selectedPackage={selectedPackage}
						onConfirm={async () => {
							await onDeletePackage(selectedPackage);
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
							resetSelections();
						}}
						onCancel={toDefaultWindow}
					/>

					<DeleteFolderWindow
						active={activeEditorWindow === EDITOR_WINDOWS.DELETE_FOLDER_WINDOW}
						selectedFolder={selectedFolder}
						onConfirm={async () => {
							await onDeleteFolder(selectedFolder);
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
							resetSelections();
						}}
						onCancel={toDefaultWindow}
					/>

					<DeleteFileWindow
						active={activeEditorWindow === EDITOR_WINDOWS.DELETE_FILE_WINDOW}
						selectedFile={selectedFile}
						onConfirm={async () => {
							await onDeleteFile(selectedFile);
							updateActiveEditorWindow(EDITOR_WINDOWS.DEFAULT_WINDOW, activeEditorWindow);
							resetSelections();
						}}
						onCancel={toDefaultWindow}
					/>

					<Editor
						active={activeEditorWindow === EDITOR_WINDOWS.CODE_EDITOR_WINDOW}
						file={selectedFile}
						onFileChange={async (fileContent) => {
							if (!selectedFile) return;
							updateFileInMemory(fileContent);
							await onFileChange({ path: selectedFile?.path, content: fileContent });
							setSelectedFile({ ...selectedFile, content: fileContent, cached: true });
						}}
					/>
				</EditorWindow>
			</Col>
		</Row>
	);
}

export default WebIDE;
