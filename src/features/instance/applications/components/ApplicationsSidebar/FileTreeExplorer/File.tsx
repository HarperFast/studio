import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { ComponentType, useCallback } from 'react';
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
	const onFileSelect = useCallback(() => {
		if (isFileSelected) {
			// Don't re-select the same file
			return;
		}
		handleFileSelect({
			filePath: directoryEntry.path || '',
			projectName: directoryEntry.project || '',
			entries: directoryEntry.entries,
			directoryReadMe: directoryEntry.entries?.find(entry => entry.name.toLowerCase() === 'readme.md'),
			pkg,
		});
	}, [handleFileSelect, directoryEntry.path, directoryEntry.project, directoryEntry.entries, pkg]);

	return (
		<button
			type="button"
			className={`whitespace-nowrap ${isFileSelected ? 'text-white' : ''}`}
			onClick={onFileSelect}
		>
			<Icon />
			<span className="pl-2 filename-text">{directoryEntry.name}</span>
			{directoryEntry.package ? <PackageLockedIcon /> : ''}
		</button>
	);
}
