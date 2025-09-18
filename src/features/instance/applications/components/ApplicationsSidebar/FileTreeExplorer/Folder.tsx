import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useParams } from '@tanstack/react-router';
import { File } from './File';
import { calculateIconForDirectoryEntry } from './lib/calculateIconForDirectoryEntry';
import { directorySortComparator } from './lib/directorySortComparator';
import { parseFileExtension } from './lib/parseFileExtension';

export function Folder({ directoryEntry, depth, pkg }: {
	readonly directoryEntry: DirectoryEntry;
	readonly depth: number;
	readonly pkg?: string;
}) {
	const { instanceId, clusterId } = useParams({ strict: false });
	const [open, setOpen] = useSessionStorage(`FolderOpened/${instanceId ?? clusterId}/${directoryEntry.key}` as 'FolderOpened/{instanceId}/{key}', depth <= 1 && !directoryEntry.package);

	const entries = [...(directoryEntry.entries || [])].sort(directorySortComparator);
	const fileExtension = parseFileExtension(directoryEntry.name);

	const Icon = calculateIconForDirectoryEntry(directoryEntry, open, setOpen, fileExtension);

	return (
		<>
			{
				depth > 0 ? (
					<li
						key={directoryEntry.key}
						className={`${directoryEntry.entries ? 'folder-container' : 'file-container'} ${
							open ? 'folder-open' : 'folder-closed'
						}`}
					>
						<File Icon={Icon} directoryEntry={directoryEntry} pkg={directoryEntry.package || pkg} />
					</li>
				) : null
			}

			{entries.map((entry) => (
				<li key={entry.key}>
					<ul className="pl-4">
						<Folder directoryEntry={entry} depth={depth + 1} pkg={directoryEntry.package || pkg} />
					</ul>
				</li>
			))}
		</>
	);
}
