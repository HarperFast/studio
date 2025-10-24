import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	importedApplications,
	newApplication,
} from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import {
	SetComponentFileRequest,
	useSetComponentFile,
} from '@/features/instance/operations/mutations/setComponentFile';
import { getComponentFileQueryOptions } from '@/features/instance/operations/queries/getComponentFile';
import {
	APIDirectoryEntry,
	APIFileEntry,
	getComponentsQueryOptions,
} from '@/features/instance/operations/queries/getComponents';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { transformNodes } from '@/lib/arrays/transformNodes';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';

export function EditorViewProvider({ children }: PropsWithChildren) {
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | undefined>(undefined);
	const [openedEntryContents, setOpenedEntryContents] = useState<string | undefined>(undefined);
	const { setContent: setUpdatedEntryContents } = useEditorFileContent(openedEntry?.path);
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
				return {
					name: node.name,
					path: [...parents.map(p => p.name), node.name].join('/'),
					project: (parents[0] || node)?.name,
					package: (parents[0] || node)?.package,
					overviewEntry: readMeAPIFile && !isDirectory(readMeAPIFile) && {
						name: readMeAPIFile.name,
						path: [...parents.map(p => p.name), node.name, readMeAPIFile.name].join('/'),
						project: (parents[0] || node)?.name,
						package: (parents[0] || node)?.package,
					} || undefined,
				} satisfies DirectoryEntry | FileEntry;
			},
		);
	}, [apiComponents]);

	const defaultFolderExpansions = rootEntries.filter(rootEntry => !rootEntry.package && rootEntry.path !== newApplication).map<TreeItemIndex>(rootEntry => rootEntry.name);
	let defaultFocusedItem = defaultFolderExpansions[0];
	let defaultSelectedItem = defaultFolderExpansions.slice(0, 1);
	if (!defaultFocusedItem) {
		defaultFocusedItem = newApplication;
		defaultSelectedItem = [newApplication];
	}
	const [focusedItem, setFocusedItem] = useSessionStorage(`FileFocused/${instanceParams.entityId}` as 'FileFocused/{entityId}', defaultFocusedItem as TreeItemIndex | undefined);
	const [expandedItems, setExpandedItems] = useSessionStorage(`FolderOpened/${instanceParams.entityId}` as 'FolderOpened/{entityId}', defaultFolderExpansions);
	const [selectedItems, setSelectedItems] = useSessionStorage(`FileSelected/${instanceParams.entityId}` as 'FileSelected/{entityId}', defaultSelectedItem);

	/*
	 Load the selected file contents.
	 */
	const pathToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.path : openedEntry.path) || '';
	const projectToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.project : openedEntry.project) || '';
	const loadedOverviewEntry = openedEntry && (isDirectory(openedEntry) ? !!openedEntry.overviewEntry?.path : false) || false;
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
		let message = getComponentFileQueryData?.message;
		if (
			loadedPath === pathToLoad && message
		) {
			const baseURL = instanceParams.instanceClient.defaults.baseURL;
			if (loadedOverviewEntry && baseURL) {
				// TODO: Link properly in template markdown.
				// TODO: Open most links in blank
				// TODO: File link handling.
				// TODO: ./apis link handling.
				// TODO: When running in the cloud vs local...
				const operations9925URL = baseURL;
				const rest9926URL = baseURL.replace(':9925', '');
				if (operations9925URL) {
					message = message.replace(/http:\/\/localhost:9926/g, rest9926URL);
				}
			}
			setOpenedEntryContents(message || undefined);
		} else {
			setOpenedEntryContents(undefined);
		}
	}, [getComponentFileQueryData, pathToLoad, loadedOverviewEntry, instanceParams]);

	/*
	 Save changes.
	 */
	const { mutate: saveComponentFile, isPending: isSavingFile } = useSetComponentFile();
	const saveFile = useCallback(
		(data: SetComponentFileRequest, filePath: string) => {
			saveComponentFile(data, {
				onSuccess: () => {
					if (openedEntry?.path === filePath && data.payload !== undefined) {
						setOpenedEntryContents(data.payload || undefined);
						setUpdatedEntryContents(undefined);
					}
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[saveComponentFile, setUpdatedEntryContents, openedEntry],
	);

	const restrictPackageModification = useMemo(() => {
		if (!openedEntry) {
			return false;
		}
		return openedEntry.package?.includes('github.com/HarperDB/status-check-fabric')
			|| openedEntry.package?.includes('github.com/HarperFast/status-check-fabric')
			|| openedEntry.path === importedApplications
			|| openedEntry.path === newApplication;
	}, [openedEntry?.package]);

	/*
	 Memoize the tracked state.
	 */
	const value = useMemo<EditorViewContextValue>(() => {
		return {

			rootEntries,
			reloadRootEntries,

			focusedItem,
			setFocusedItem,
			expandedItems,
			setExpandedItems,
			selectedItems,
			setSelectedItems,

			restrictPackageModification,
			openedEntry,
			setOpenedEntry,

			openedEntryContents,
			setOpenedEntryContents,

			saveFile,
			isSavingFile,

		};
	}, [
		rootEntries,
		reloadRootEntries,

		focusedItem,
		setFocusedItem,
		expandedItems,
		setExpandedItems,
		selectedItems,
		setSelectedItems,

		restrictPackageModification,
		openedEntry,
		setOpenedEntry,

		openedEntryContents,
		setOpenedEntryContents,

		saveFile,
		isSavingFile,
	]);
	return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
}
