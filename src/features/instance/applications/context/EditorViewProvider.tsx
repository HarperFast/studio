import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	importedApplications,
	newApplication,
} from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { parseReadMe } from '@/features/instance/applications/lib/parseReadMe';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import {
	getComponentFileQueryKey,
	getComponentFileQueryOptions,
} from '@/integrations/api/instance/applications/getComponentFile';
import {
	APIDirectoryEntry,
	APIFileEntry,
	getComponentsQueryOptions,
} from '@/integrations/api/instance/applications/getComponents';
import {
	SetComponentFileRequest,
	useSetComponentFile,
} from '@/integrations/api/instance/applications/setComponentFile';
import { transformNodes } from '@/lib/arrays/transformNodes';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';

export function EditorViewProvider({ children }: PropsWithChildren) {
	const navigate = useNavigate();
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | undefined>(undefined);
	const [openedEntryContents, setOpenedEntryContents] = useState<string | undefined>(undefined);
	const { setContent: setUpdatedEntryContents } = useEditorFileContent(openedEntry?.path);
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const { open }: { open?: string } = useSearch({ strict: false });

	/*
	 Create our structured view from the relational API data.
	 */
	const { data: apiComponents } = useSuspenseQuery(getComponentsQueryOptions(instanceParams));
	const mappedData: {
		rootEntries: Array<DirectoryEntry | FileEntry>,
		pathsRegistry: Set<string>,
	} = useMemo(() => {
		const pathsRegistry = new Set<string>();
		const rootEntries = transformNodes(
			apiComponents.entries || [],
			'entries',
			(node: APIFileEntry | APIDirectoryEntry, parents: APIDirectoryEntry[]) => {
				const readMeAPIFile = isDirectory(node) && node.entries.find(e => e.name.toLowerCase() === 'readme.md');
				const path = [...parents.map(p => p.name), node.name].join('/');
				pathsRegistry.add(path);
				return {
					name: node.name,
					path,
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
		return {
			rootEntries,
			pathsRegistry,
		};
	}, [apiComponents]);

	const reloadRootEntries = useCallback(async () =>
		queryClient.fetchQuery<APIDirectoryEntry>({
			queryKey: [instanceParams.entityId, 'get_components'],
			networkMode: 'online',
		}), [queryClient, instanceParams]);

	const entryExists = useCallback((path: string) => {
		return mappedData.pathsRegistry.has(path);
	}, [mappedData.pathsRegistry]);

	const defaultFolderExpansions = mappedData.rootEntries.filter(rootEntry => !rootEntry.package && rootEntry.path !== newApplication).map<TreeItemIndex>(rootEntry => rootEntry.name);
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
	 Support URL links to files.
	 */
	useEffect(() => {
		if (open?.length) {
			const parts = open.split('/');

			setExpandedItems(expandedItems => {
				const expansion = new Set(expandedItems);
				for (let i = 1; i < parts.length; i++) {
					expansion.add(parts.slice(0, i).join('/'));
				}
				return [...expansion];
			});

			setSelectedItems([open]);
			setFocusedItem(open);

			void navigate({ search: undefined });
		}
	}, [navigate, open, setExpandedItems, setFocusedItem, setSelectedItems]);

	/*
	 Load the selected file contents.
	 */
	const pathToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.path : openedEntry.path) || '';
	const projectToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.project : openedEntry.project) || '';
	const loadedOverviewEntry = openedEntry && (isDirectory(openedEntry) ? !!openedEntry.overviewEntry?.path : false) || false;
	const fileQueryKey = getComponentFileQueryKey({
		file: pathToLoad?.split('/').slice(1).join('/'),
		project: projectToLoad,
		...instanceParams,
	});
	const { data: getComponentFileQueryData } = useQuery(
		getComponentFileQueryOptions(
			{
				file: pathToLoad?.split('/').slice(1).join('/'),
				project: projectToLoad,
				...instanceParams,
			},
		),
	);
	useEffect(function setOpenedEntryContentsFromAPIResponse() {
		const loadedPath = getComponentFileQueryData?.project + '/' + getComponentFileQueryData?.file;
		let contents = getComponentFileQueryData?.message;
		if (
			loadedPath === pathToLoad && contents !== undefined
		) {
			const baseURL = instanceParams.instanceClient.defaults.baseURL;
			if (loadedOverviewEntry && baseURL && getComponentFileQueryData) {
				contents = parseReadMe(contents, baseURL, getComponentFileQueryData);
			}
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setOpenedEntryContents(contents);
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
						setUpdatedEntryContents(undefined);
						setOpenedEntryContents(data.payload || undefined);
						queryClient.setQueryData(fileQueryKey, { ...getComponentFileQueryData, message: data.payload });
					}
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[fileQueryKey, getComponentFileQueryData, openedEntry?.path, queryClient, saveComponentFile, setUpdatedEntryContents],
	);

	const restrictPackageModification = useMemo(() => {
		if (!openedEntry) {
			return false;
		}
		return openedEntry.package?.includes('github.com/HarperDB/status-check-fabric')
			|| openedEntry.package?.includes('github.com/HarperFast/status-check-fabric')
			|| openedEntry.path === importedApplications
			|| openedEntry.path === newApplication;
	}, [openedEntry]);

	/*
	 Memoize the tracked state.
	 */
	const value = useMemo<EditorViewContextValue>(() => {
		return {

			rootEntries: mappedData.rootEntries,
			reloadRootEntries,
			entryExists,

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
		mappedData.rootEntries,
		reloadRootEntries,
		entryExists,

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
