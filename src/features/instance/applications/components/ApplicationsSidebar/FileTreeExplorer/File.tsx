import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { ComponentType } from 'react';
import { PackageLockedIcon } from './PackageLockedIcon';

export function File({
	directoryEntry,
	Icon,
	pkg,
}: {
	readonly directoryEntry: DirectoryEntry;
	readonly Icon: ComponentType<unknown>;
	readonly pkg: string | undefined;
}) {
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
					pkg,
				});
			}}
		>
			<Icon />
			<span className="pl-2 filename-text">{directoryEntry.name}</span>
			{directoryEntry.package ? <PackageLockedIcon /> : ''}
		</button>
	);
}
