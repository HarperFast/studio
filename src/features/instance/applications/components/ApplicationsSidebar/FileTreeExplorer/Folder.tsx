import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { useState } from 'react';
import { calculateIconForDirectoryEntry } from './lib/calculateIconForDirectoryEntry';
import { directorySortComparator } from './lib/directorySortComparator';
import { parseFileExtension } from './lib/parseFileExtension';
import { File } from './File';

export function Folder({ directoryEntry, depth, pkg }: {
	readonly directoryEntry: DirectoryEntry;
	readonly depth: number;
	readonly pkg?: string;
}) {
	const [open, setOpen] = useState(depth <= 1 && !directoryEntry.package);

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
