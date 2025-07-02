import React, { useState, useEffect } from 'react';
import cn from 'classnames';
import { Card, CardBody } from 'reactstrap';

function NoProjects() {
	return (
		<Card className="file-browser-scroll-container">
			<CardBody>
				<div className="p-4">
					You have no Harper applications yet. <br />
					<br />
					Click &quot;
					<i className="fas fa-plus" /> app&quot; above to create one!
					<br />
					<br />
					See the{' '}
					<a className="docs-link" href="https://docs.harperdb.io" target="_blank" rel="noreferrer">
						documentation
					</a>{' '}
					for more info on Harper Applications.
				</div>
			</CardBody>
		</Card>
	);
}

function parseFileExtension(name) {
	return name && [...name].includes('.') ? name.split('.').slice(-1)[0] : null;
}
function directorySortComparator(a, b) {
	// TODO: refactor.

	// directories first, then flat files sorted
	// ascending, alphanumerically
	const A = +Boolean(a.entries);
	const B = +Boolean(b.entries);

	return A === B ? a.name.localeCompare(b.name) : B - A;
}

const isFolder = (entry) => Boolean(entry.entries);

function ProjectIcon({ toggleClosed, isOpen }) {
	return (
		<i
			onClick={toggleClosed}
			onKeyDown={toggleClosed}
			className={cn(`project-icon fas fa-file-code`)}
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls="folder"
			aria-label={isOpen ? 'close project' : 'open project'}
			role="button"
		/>
	);
}
function FolderIcon({ toggleClosed, isOpen }) {
	return (
		// TODO: A11y on this is not good at all..... Need to refactor the file tree to make the file tree more accessible for ALL users.
		<i
			onClick={toggleClosed}
			onKeyDown={toggleClosed}
			className={cn(`folder-icon fas ${isOpen ? 'fa-folder-open' : 'fa-folder'}`)}
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls="folder"
			aria-label={isOpen ? 'close folder' : 'open folder'}
			role="button"
		/>
	);
}

function FiletypeIcon({ extension }) {
	switch (extension) {
		case 'js':
			return <i className={cn('file-icon filetype-js fab fa-js')} />;
		case 'yaml':
			return <i className={cn('file-icon filetype-yaml fas fa-cog')} />;
		default:
			return <i className={cn('file-icon filetype-unknown far fa-file-alt')} />;
	}
}

function PackageIcon() {
	return <i className={cn('package-icon fas fa-cube')} />;
}

function Package({ name, url, onPackageSelect, selectedPackage }) {
	// FIXME: when we click another package, they both get selected.
	const [selected, setSelected] = useState(Boolean(selectedPackage) && name === selectedPackage?.name);

	useEffect(() => {
		setSelected(selectedPackage && selectedPackage.name === name);
	}, [selectedPackage, name]);

	return (
		<button
			type="button"
			onClick={(e) => {
				if (selected) {
					onPackageSelect(null);
				} else {
					onPackageSelect({ name, url, event: e });
				}
				setSelected(!selected);
			}}
			className={cn('package', {
				'package-selected': selected,
			})}
			onKeyDown={() => {}}
		>
			<PackageIcon />
			<span className="package-text">{name}</span>
		</button>
	);
}

function File({ directoryEntry, selectedFile, selectedFolder, onFileSelect, onFolderSelect, Icon }) {
	const isDir = isFolder(directoryEntry);
	const renameFileIconClass = 'rename-file';
	const deployFileIconClass = 'deploy-project';
	const isFileSelected = directoryEntry.path === selectedFile;
	const isFolderSelected = directoryEntry.path === selectedFolder?.path;
	// file receives open/close toggle func from
	// parent. if it's a dir, calls toggle func on click
	// if it's a flat file, calls onFileSelect so
	// parent can get file content.

	function noOp() {
		// TODO: figure out how to handle keyboard events properly.
		// for now, use this to avoid react a11y errors.
	}

	function handleToggleSelected(e) {
		// TODO FIX HANDLING SO WE CAN HAVE NUANCED CLICK BEHAVIOR

		// set the folder/file as currently selected folder/file
		// visually highlight directory name
		// note: if directory already highlighted, make sure if we've clicked on the pencil/edit icon
		// that we don't untoggle directory selection; leave selected if icon clicked.
		const iconWasClicked =
			e.target.classList.contains(renameFileIconClass) || e.target.classList.contains(deployFileIconClass);
		// if icon's clicked, select, but don't unselect.
		// if (iconWasClicked) return;

		if (isDir) {
			// one click on dir name toggles selected / highlighted state / ui
			if (isFolderSelected && iconWasClicked) {
				// TODO: don't
			} else {
				onFolderSelect(isFolderSelected ? null : directoryEntry);
			}
		} else if (isFileSelected) {
			onFileSelect(null);
		} else {
			// one click on file name sets it to selected / highlighted
			// AND retrieves file content
			onFileSelect(directoryEntry);
		}
	}

	return (
		<button
			type="button"
			onClick={handleToggleSelected}
			className={cn('file', {
				'file-selected': isFileSelected,
				'folder-selected': isFolderSelected,
			})}
			onKeyDown={noOp}
		>
			<Icon className="filename-icon" />
			<span className="filename-text">{directoryEntry.name}</span>
		</button>
	);
}

function Folder({
	directoryEntry,
	userOnSelect,
	onFolderSelect,
	onDeployProject,
	onFileSelect,
	onPackageSelect,
	onFileRename,
	selectedFile,
	selectedFolder,
	selectedPackage,
}) {
	const [open, setOpen] = useState(true);

	const entries = [...(directoryEntry.entries || [])].sort(directorySortComparator);
	const fileExtension = parseFileExtension(directoryEntry.name);

	let Icon;
	// top-level dir === package
	// FolderIcon/PackageIcon is func so we can give it open args now, but instantiate it later.
	if (directoryEntry.path.split('/').length === 2) {
		Icon = () => ProjectIcon({ isOpen: open, toggleClosed: () => setOpen(!open) });
	} else if (directoryEntry.entries) {
		Icon = () => FolderIcon({ isOpen: open, toggleClosed: () => setOpen(!open) });
	} else {
		Icon = () => FiletypeIcon({ extension: fileExtension });
	}

	return (
		<>
			{
				// FIXME: don't hardcode 'components', get from root .name property of fileTree.
				directoryEntry.name !== 'components' ? (
					<li
						key={directoryEntry.key}
						className={cn(
							`${directoryEntry.entries ? 'folder-container' : 'file-container'} ${open ? 'folder-open' : 'folder-closed'}`
						)}
					>
						{directoryEntry.package ? (
							<Package
								selectedPackage={selectedPackage}
								onPackageSelect={onPackageSelect}
								name={directoryEntry.name}
								url={directoryEntry.package}
							/>
						) : (
							<File
								Icon={Icon}
								selectedFile={selectedFile}
								selectedFolder={selectedFolder}
								selectedPackage={selectedPackage}
								directoryEntry={directoryEntry}
								onDeployProject={onDeployProject}
								onFileRename={() => {
									onFileRename(directoryEntry);
								}}
								onFileSelect={onFileSelect}
								onFolderSelect={onFolderSelect}
								userOnSelect={userOnSelect}
							/>
						)}
					</li>
				) : null
			}

			{entries.map((entry) => (
				<li key={entry.key}>
					<ul
						className={cn('folder', {
							// TODO: fix this logic, folders aren't closing.
							'folder-contents-open': true,
							'folder-contents-closed': false,
						})}
					>
						<Folder
							selectedFile={selectedFile}
							selectedFolder={selectedFolder}
							selectedPackage={selectedPackage}
							directoryEntry={entry}
							onFileSelect={onFileSelect}
							onDeployProject={onDeployProject}
							onFileRename={onFileRename}
							onFolderSelect={onFolderSelect}
							onPackageSelect={onPackageSelect}
							userOnSelect={userOnSelect}
						/>
					</ul>
				</li>
			))}
		</>
	);
}

// A recursive directory tree representation
function FileBrowser({
	files,
	userOnSelect,
	onFileSelect,
	onPackageSelect,
	onDeployProject,
	onFileRename,
	onFolderSelect,
	selectedFile,
	selectedFolder,
	selectedPackage,
}) {
	return !files?.entries?.length ? (
		<NoProjects />
	) : (
		<Card className="file-browser-scroll-container">
			<CardBody>
				<ul className="file-browser">
					<Folder
						selectedFile={selectedFile}
						selectedFolder={selectedFolder}
						selectedPackage={selectedPackage}
						onFileSelect={onFileSelect}
						onFileRename={onFileRename}
						onFolderSelect={onFolderSelect}
						onDeployProject={onDeployProject}
						onPackageSelect={onPackageSelect}
						userOnSelect={userOnSelect}
						directoryEntry={files}
					/>
				</ul>
			</CardBody>
		</Card>
	);
}

export default FileBrowser;
