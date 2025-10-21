// import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
// import { useSessionStorage } from '@/hooks/useSessionStorage';
// import { useParams } from '@tanstack/react-router';
// import { cx } from 'class-variance-authority';
// import { ReactElement, SyntheticEvent, useCallback } from 'react';
// import { File } from './File';
// import { FileTypeIcon } from './FileTypeIcon';
// import { FolderIcon } from './FolderIcon';
// import { parseFileExtension } from './lib/parseFileExtension';
// import { PackageIcon } from './PackageIcon';
// import { ProjectIcon } from './ProjectIcon';
//
// export function Folder({ directoryEntry, depth, pkg }: {
// 	readonly directoryEntry: DirectoryEntry;
// 	readonly depth: number;
// 	readonly pkg?: string;
// }) {
// 	const { instanceId, clusterId } = useParams({ strict: false });
// 	const [open, setOpen] = useSessionStorage(`FolderOpened/${instanceId ?? clusterId}/${directoryEntry.key}` as 'FolderOpened/{instanceId}/{key}', depth <= 1 && !directoryEntry.package);
// 	const toggle = useCallback((e: SyntheticEvent) => {
// 		e.preventDefault();
// 		setOpen((opened => !opened));
// 		return false;
// 	}, []);
//
// 	const entries = [...(directoryEntry.entries || [])].sort(directorySortComparator);
// 	const fileExtension = parseFileExtension(directoryEntry.name);
//
// 	let Icon: ReactElement;
// 	if (directoryEntry.package) {
// 		Icon = <PackageIcon open={open} toggle={toggle} />;
// 	} else if (directoryEntry.path && directoryEntry.path.split('/').length === 2) {
// 		Icon = <ProjectIcon open={open} toggle={toggle} />;
// 	} else if (directoryEntry.entries) {
// 		Icon = <FolderIcon open={open} toggle={toggle} />;
// 	} else {
// 		Icon = <FileTypeIcon extension={fileExtension} />;
// 	}
//
// 	return (
// 		<>
// 			{
// 				depth > 0 && (
// 					<li
// 						key={directoryEntry.key}
// 						className={cx(
// 							directoryEntry.entries ? 'folder-container' : 'file-container',
// 							open ? 'folder-open' : 'folder-closed',
// 						)}
// 					>
// 						<File Icon={Icon} directoryEntry={directoryEntry} pkg={directoryEntry.package || pkg} />
// 					</li>
// 				)
// 			}
//
// 			{entries.map((entry) => (
// 				<li key={entry.key}>
// 					<ul className="pl-4">
// 						<Folder directoryEntry={entry} depth={depth + 1} pkg={directoryEntry.package || pkg} />
// 					</ul>
// 				</li>
// 			))}
// 		</>
// 	);
// }
