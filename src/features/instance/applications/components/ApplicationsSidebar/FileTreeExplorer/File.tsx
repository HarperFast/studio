// import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
// import { ReactElement, useCallback } from 'react';
// import { PackageLockedIcon } from './PackageLockedIcon';
//
// export function File({
// 	directoryEntry,
// 	Icon,
// }: {
// 	readonly directoryEntry: DirectoryEntry;
// 	readonly Icon: ReactElement;
// }) {
// 	const { setOpenedEntry, openedEntry } = useEditorView();
//
// 	const isFileSelected = openedEntry?.path === directoryEntry.path;
// 	const onFileSelect = useCallback(() => {
// 		if (isFileSelected) {
// 			// Don't re-select the same file
// 			return;
// 		}
// 		setOpenedEntry(directoryEntry);
// 	}, [setOpenedEntry, isFileSelected, directoryEntry]);
//
// 	return (<>
// 		<button
// 			type="button"
// 			className={`select-none whitespace-nowrap ${isFileSelected ? 'text-white' : ''}`}
// 			onClick={onFileSelect}
// 			onKeyDown={onFileSelect}
// 		>
// 			{Icon}
// 			<span className="pl-2 filename-text">{directoryEntry.name}</span>
// 			{directoryEntry.package ? <PackageLockedIcon /> : ''}
// 		</button>
// 	</>);
// }
