import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	SetComponentFileRequest,
	useUpdateComponentFile,
} from '@/features/instance/operations/mutations/updateComponentFile';
import { getComponentFileQueryOptions } from '@/features/instance/operations/queries/getComponentFile';
import {
	APIDirectoryEntry,
	APIFileEntry,
	getComponentsQueryOptions,
} from '@/features/instance/operations/queries/getComponents';
import { transformNodes } from '@/lib/arrays/transformNodes';
import { useQuery } from '@tanstack/react-query';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';

export function EditorViewProvider({ children }: PropsWithChildren) {
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | null>(null);
	const [openedEntryContents, setOpenedEntryContents] = useState<string | null>(null);
	const instanceParams = useInstanceClientIdParams();

	/*
	 Create our structured view from the relational API data.
	 */
	const { data: apiComponents } = useQuery(getComponentsQueryOptions(instanceParams));
	const rootEntries: Array<DirectoryEntry | FileEntry> = useMemo(() => {
		if (!apiComponents) {
			return [];
		}
		return transformNodes(
			apiComponents.entries,
			'entries',
			(node: APIFileEntry | APIDirectoryEntry, parents: APIDirectoryEntry[]) => {
				return {
					name: node.name,
					path: [...parents.map(p => p.name), node.name].join('/'),
					project: parents[0]?.name,
					package: parents[0]?.package,
				} satisfies DirectoryEntry | FileEntry;
			},
		);

	}, [apiComponents]);

	/*
	 Load the selected file contents.
	 */
	const { data: getComponentFileQueryData } = useQuery(
		getComponentFileQueryOptions(
			{
				file: !openedEntry || isDirectory(openedEntry)
					? ''
					: openedEntry.path.split('/').slice(1).join('/'),
				project: openedEntry?.project ?? '',
				...instanceParams,
			},
		),
	);
	useEffect(() => {
		const loadedPath = getComponentFileQueryData?.project + '/' + getComponentFileQueryData?.file;
		if (
			loadedPath === openedEntry?.path &&
			getComponentFileQueryData?.message
		) {
			setOpenedEntryContents(getComponentFileQueryData.message);
		} else {
			setOpenedEntryContents(null);
		}
	}, [getComponentFileQueryData, openedEntry]);

	/*
	 Save changes.
	 */
	const { mutate: saveComponentFile, isPending: isSavingFile } = useUpdateComponentFile();
	const saveFile = useCallback(
		(data: SetComponentFileRequest, filePath: string) => {
			saveComponentFile(data, {
				onSuccess: () => {
					if (openedEntry?.path === filePath && data.payload) {
						setOpenedEntryContents(data.payload);
					}
					toast.success('Success', {
						description: `${data.file.split('/').pop()} saved successfully. A restart is required to see changes.`,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[saveComponentFile, openedEntry],
	);

	/*
	 Memoize the tracked state.
	 */
	const value = useMemo<EditorViewContextValue>(() => {
		return {

			rootEntries,

			openedEntry,
			setOpenedEntry,

			openedEntryContents,
			setOpenedEntryContents,

			saveFile,
			isSavingFile,

		};
	}, [rootEntries, openedEntry, openedEntryContents, isSavingFile]);
	return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
}
