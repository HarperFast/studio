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
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';

export function EditorViewProvider({ children }: PropsWithChildren) {
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | null>(null);
	const [openedEntryContents, setOpenedEntryContents] = useState<string | null>(null);
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();

	const reloadRootEntries = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'get_components'],
			refetchType: 'active',
		});
	}, [queryClient, instanceParams]);

	/*
	 Create our structured view from the relational API data.
	 */
	const { data: apiComponents } = useSuspenseQuery(getComponentsQueryOptions(instanceParams));
	const rootEntries: Array<DirectoryEntry | FileEntry> = useMemo(() => {
		if (!apiComponents) {
			return [];
		}
		return transformNodes(
			apiComponents.entries,
			'entries',
			(node: APIFileEntry | APIDirectoryEntry, parents: APIDirectoryEntry[]) => {
				const readMeAPIFile = isDirectory(node) && node.entries.find(e => e.name.toLowerCase() === 'readme.md');
				const overviewEntry = readMeAPIFile && !isDirectory(readMeAPIFile) && {
					name: readMeAPIFile.name,
					path: [...parents.map(p => p.name), node.name, readMeAPIFile.name].join('/'),
					project: (parents[0] || node)?.name,
					package: (parents[0] || node)?.package,
				} || undefined;
				return {
					name: node.name,
					path: [...parents.map(p => p.name), node.name].join('/'),
					project: (parents[0] || node)?.name,
					package: (parents[0] || node)?.package,
					overviewEntry,
				} satisfies DirectoryEntry | FileEntry;
			},
		);

	}, [apiComponents]);

	/*
	 Load the selected file contents.
	 */
	const pathToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.path : openedEntry.path) || '';
	const projectToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.project : openedEntry.project) || '';
	const { data: getComponentFileQueryData } = useQuery(
		getComponentFileQueryOptions(
			{
				file: pathToLoad?.split('/').slice(1).join('/'),
				project: projectToLoad,
				...instanceParams,
			},
		),
	);
	useEffect(() => {
		const loadedPath = getComponentFileQueryData?.project + '/' + getComponentFileQueryData?.file;
		if (
			loadedPath === pathToLoad &&
			getComponentFileQueryData?.message
		) {
			setOpenedEntryContents(getComponentFileQueryData.message);
		} else {
			setOpenedEntryContents(null);
		}
	}, [getComponentFileQueryData, pathToLoad]);

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
			reloadRootEntries,

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
