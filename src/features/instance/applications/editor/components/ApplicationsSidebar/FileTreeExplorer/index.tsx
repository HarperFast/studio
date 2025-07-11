import { GetComponentsResponse, DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import './filetree.css';
import { useState } from 'react';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';

interface ParseFileExtension {
	(name: string): string | null;
}

const parseFileExtension: ParseFileExtension = (name) => {
	return name && [...name].includes('.') ? name.split('.').slice(-1)[0] : null;
};
interface DirectorySortComparatorEntry {
	name: string;
	entries?: DirectoryEntry[];
}

function directorySortComparator(a: DirectorySortComparatorEntry, b: DirectorySortComparatorEntry): number {
	// TODO: refactor.

	// directories first, then flat files sorted
	// ascending, alphanumerically
	const A = +Boolean(a.entries);
	const B = +Boolean(b.entries);

	return A === B ? a.name.localeCompare(b.name) : B - A;
}

function ProjectIcon({
	toggleClosed,
	isOpen,
}: {
	toggleClosed: (event: React.MouseEvent | React.KeyboardEvent) => void;
	isOpen: boolean;
}) {
	return (
		<i
			onClick={toggleClosed}
			onKeyDown={toggleClosed}
			className={`project-icon fas fa-file-code text-green`}
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls="folder"
			aria-label={isOpen ? 'close project' : 'open project'}
			role="button"
		/>
	);
}

function FolderIcon({
	toggleClosed,
	isOpen,
}: {
	toggleClosed: (event: React.MouseEvent | React.KeyboardEvent) => void;
	isOpen: boolean;
}) {
	return (
		// TODO: A11y on this is not good at all..... Need to refactor the file tree to make the file tree more accessible for ALL users.
		<i
			onClick={toggleClosed}
			onKeyDown={toggleClosed}
			className={`folder-icon fas text-purple ${isOpen ? 'fa-folder-open' : 'fa-folder'}`}
			tabIndex={0}
			aria-expanded={isOpen}
			aria-controls="folder"
			aria-label={isOpen ? 'close folder' : 'open folder'}
			role="button"
		/>
	);
}

function FiletypeIcon({ extension }: { extension: string | null }) {
	switch (extension) {
		case 'js':
			return <i className={'file-icon filetype-js fab fa-js text-yellow'} />;
		case 'jsx':
			return <i className={'file-icon filetype-jsx fab fa-js text-yellow'} />;
		case 'cjs':
			return <i className={'file-icon filetype-cjs fab fa-js text-yellow'} />;
		case 'yaml':
			return <i className={'file-icon filetype-yaml fas fa-file'} />;
		case 'css':
			return <i className={'file-icon filetype-css fas fa-file text-blue'} />;
		case 'html':
			return <i className={'file-icon filetype-html fas fa-html5 text-orange'} />;
		case 'json':
			return <i className={'file-icon filetype-json fas fa-cog'} />;
		case 'ts':
			return <i className={'file-icon filetype-ts fas fa-file text-blue'} />;
		case 'tsx':
			return <i className={'file-icon filetype-tsx fas fa-file text-blue'} />;
		case 'png':
			return <i className={'file-icon filetype-png fas fa-image'} />;
		case 'jpg':
			return <i className={'file-icon filetype-jpg fas fa-image'} />;
		case 'jpeg':
			return <i className={'file-icon filetype-jpeg fas fa-image'} />;
		case 'gif':
			return <i className={'file-icon filetype-gif fas fa-image'} />;
		case 'svg':
			return <i className={'file-icon filetype-svg fas fa-file-svg'} />;
		case 'vue':
			return <i className={'file-icon filetype-vue fab fa-vuejs text-green'} />;
		default:
			return <i className={'file-icon filetype-unknown far fa-file-alt'} />;
	}
}

function PackageIcon() {
	return <i className={'package-icon fas fa-cube'} />;
}

function Package({ name }: { name: string }) {
	return (
		<button type="button">
			<PackageIcon />

			<span className="package-text">{name}</span>
		</button>
	);
}

function File({ directoryEntry, Icon }: { directoryEntry: DirectoryEntry; Icon?: React.ComponentType<unknown> }) {
	const { handleFileSelect, selectedFolderFile } = useEditorView();
	const isFileSelected = selectedFolderFile.filePath === directoryEntry.path;
	return (
		<button
			type="button"
			className={`whitespace-nowrap ${isFileSelected ? 'text-white' : ''}`}
			onClick={() => {
				if (isFileSelected) return; // Don't re-select the same file

				handleFileSelect({
					filePath: directoryEntry.path || '',
					projectName: directoryEntry.project || '',
					entries: directoryEntry.entries,
				});
			}}
		>
			{/* NOTE: Doing this to pass the build time check, but not actually needing to do the ternary just <Icon /> */}
			{Icon ? <Icon /> : ''}
			<span className="pl-2 filename-text">{directoryEntry.name}</span>
		</button>
	);
}

function Folder({ directoryEntry }: { directoryEntry: DirectoryEntry }) {
	const [open, setOpen] = useState(true);

	const entries = [...(directoryEntry.entries || [])].sort(directorySortComparator);
	const fileExtension = parseFileExtension(directoryEntry.name);

	let Icon: React.ComponentType<HTMLElement>;
	// top-level dir === package
	// FolderIcon/PackageIcon is func so we can give it open args now, but instantiate it later.
	if (directoryEntry.path && directoryEntry.path.split('/').length === 2) {
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
						className={`${directoryEntry.entries ? 'folder-container' : 'file-container'} ${
							open ? 'folder-open' : 'folder-closed'
						}`}
					>
						{directoryEntry.package ? (
							<Package name={directoryEntry.name} />
						) : (
							<File Icon={Icon} directoryEntry={directoryEntry} />
						)}
					</li>
				) : null
			}

			{entries.map((entry) => (
				<li key={entry.key}>
					<ul className="pl-2">
						<Folder directoryEntry={entry} />
					</ul>
				</li>
			))}
		</>
	);
}

// A recursive directory tree representation
export function FileTreeExplorer({ files }: { files: GetComponentsResponse }) {
	return (
		<div>
			<div>
				<ul className="text-gray-400">
					<Folder directoryEntry={files} />
				</ul>
			</div>
		</div>
	);
}
