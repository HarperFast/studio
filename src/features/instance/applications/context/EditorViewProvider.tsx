import { useEntityRestURL } from '@/config/useEntityRestURL';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	calculateRootEntries,
} from '@/features/instance/applications/components/ApplicationsSidebar/calculateRootEntries';
import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import {
	discardEditorFileContentIfSaved,
	editorFileContentKey,
	useEditorFileContentId,
} from '@/features/instance/applications/context/editorFileContent';
import { parseReadMe } from '@/features/instance/applications/lib/parseReadMe';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import {
	getComponentFileQueryKey,
	getComponentFileQueryOptions,
	GetComponentFileResponse,
} from '@/integrations/api/instance/applications/getComponentFile';
import { APIDirectoryEntry, getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import {
	SetComponentFileRequest,
	useSetComponentFile,
} from '@/integrations/api/instance/applications/setComponentFile';
import { useListener } from '@/lib/events/listener';
import { setWatchedValue } from '@/lib/events/watcher';
import { isBinaryFile } from '@/lib/string/binaryFileType';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PropsWithChildren, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';
import { isProtectedEntry } from './isProtectedComponentPackage';

interface LoadedContents {
	entryKey: string | undefined;
	contents: string | undefined;
}

// The router keeps this page mounted across a switch to another instance, so a path alone can name
// two files.
function entryKeyOf(entityId: string, path: string | undefined) {
	return path === undefined ? undefined : `${entityId}:${path}`;
}

export function EditorViewProvider({ children }: PropsWithChildren) {
	const navigate = useNavigate();
	const instanceParams = useInstanceClientIdParams();
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | undefined>(undefined);
	const openedEntryKey = entryKeyOf(instanceParams.entityId, openedEntry?.path);
	// Committed entries only: a render can be discarded before it commits.
	const openedEntryKeyRef = useRef(openedEntryKey);
	useLayoutEffect(() => {
		openedEntryKeyRef.current = openedEntryKey;
	}, [openedEntryKey]);
	// Contents are scoped to the entry (instance and path) they were loaded for.
	const [loadedContents, setLoadedContents] = useState<LoadedContents>({ entryKey: undefined, contents: undefined });
	const openedEntryContents = loadedContents.entryKey === openedEntryKey ? loadedContents.contents : undefined;
	const setOpenedEntryContents = useCallback<EditorViewContextValue['setOpenedEntryContents']>(contents => {
		if (openedEntryKeyRef.current !== openedEntryKey) {
			return;
		}
		setLoadedContents(previous => ({
			entryKey: openedEntryKey,
			contents: typeof contents === 'function'
				? contents(previous.entryKey === openedEntryKey ? previous.contents : undefined)
				: contents,
		}));
	}, [openedEntryKey]);
	const editorFileContentId = useEditorFileContentId();
	const baseURL = useEntityRestURL();
	const queryClient = useQueryClient();
	const { open }: { open?: string } = useSearch({ strict: false });

	/*
	 Create our structured view from the relational API data.
	 */
	const { data: apiComponents } = useQuery(getComponentsQueryOptions(instanceParams));
	const mappedData = useMemo(() => {
		if (!apiComponents) {
			return {
				rootEntries: [],
				pathsRegistry: new Map(),
				allEntries: new Map(),
			};
		}
		return calculateRootEntries(apiComponents.entries);
	}, [apiComponents]);

	const reloadRootEntries = useCallback(async () =>
		queryClient.fetchQuery<APIDirectoryEntry>({
			queryKey: [instanceParams.entityId, 'get_components'],
			networkMode: 'online',
		}), [queryClient, instanceParams]);

	useListener('ReloadApplicationRootEntries', reloadRootEntries, [reloadRootEntries]);

	const entryExists = useCallback((path: string) => {
		return mappedData.pathsRegistry.has(path);
	}, [mappedData.pathsRegistry]);

	const defaultFolderExpansions = mappedData.rootEntries.filter(rootEntry =>
		!rootEntry.package && rootEntry.path !== newApplication
	).map<TreeItemIndex>(rootEntry => rootEntry.name);
	let defaultFocusedItem = defaultFolderExpansions[0];
	let defaultSelectedItem = defaultFolderExpansions.slice(0, 1);
	if (!defaultFocusedItem && apiComponents) {
		defaultFocusedItem = newApplication;
		defaultSelectedItem = [newApplication];
	}
	const [focusedItem, setFocusedItem] = useSessionStorage(
		`FileFocused/${instanceParams.entityId}` as 'FileFocused/{entityId}',
		defaultFocusedItem as TreeItemIndex | undefined,
	);
	const [expandedItems, setExpandedItems] = useSessionStorage(
		`FolderOpened/${instanceParams.entityId}` as 'FolderOpened/{entityId}',
		defaultFolderExpansions,
	);
	const [selectedItems, setSelectedItems] = useSessionStorage(
		`FileSelected/${instanceParams.entityId}` as 'FileSelected/{entityId}',
		defaultSelectedItem,
	);

	/*
	 Support URL links to files.
	 */
	useEffect(() => {
		if (open?.length) {
			// ./schema.graphql?AddSchemaTable=true
			const openParts = open.split('?');
			const ref = openParts[0];
			const action = openParts[1];
			const refParts = ref.split('/');

			if (action) {
				const actionParts = action.split('=');
				setWatchedValue(
					actionParts[0] as any,
					actionParts[1] === 'true' ? true : actionParts[1] === 'false' ? false : actionParts[1],
				);
			}
			setExpandedItems(expandedItems => {
				const expansion = new Set(expandedItems);
				for (let i = 1; i < refParts.length; i++) {
					expansion.add(refParts.slice(0, i).join('/'));
				}
				return [...expansion];
			});

			setSelectedItems([ref]);
			setFocusedItem(ref);

			void navigate({ search: undefined });
		}
	}, [navigate, open, setExpandedItems, setFocusedItem, setSelectedItems]);

	/*
	 Load the selected file contents.
	 */
	const pathToLoad = openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.path : openedEntry.path)
		|| '';
	const projectToLoad =
		openedEntry && (isDirectory(openedEntry) ? openedEntry.overviewEntry?.project : openedEntry.project) || '';
	const loadedOverviewEntry = openedEntry && (isDirectory(openedEntry) ? !!openedEntry.overviewEntry?.path : false)
		|| false;
	// Binary files (archives, fonts, etc.) are shown as a placeholder, so don't
	// fetch their contents — decoding a large archive as text wastes bandwidth and
	// risks choking the editor. Leave the file undefined to disable the query.
	const isBinaryEntry = !!openedEntry && !isDirectory(openedEntry) && isBinaryFile(openedEntry.name);
	const fileToLoad = isBinaryEntry ? undefined : pathToLoad?.split('/').slice(1).join('/');
	const fileQueryKey = getComponentFileQueryKey({
		file: fileToLoad,
		project: projectToLoad,
		...instanceParams,
	});
	const { data: getComponentFileQueryData, isError: openedEntryReadFailed } = useQuery(
		getComponentFileQueryOptions(
			{
				file: fileToLoad,
				project: projectToLoad,
				...instanceParams,
			},
		),
	);
	useEffect(function setOpenedEntryContentsFromAPIResponse() {
		const loadedPath = getComponentFileQueryData?.project + '/' + getComponentFileQueryData?.file;
		let contents = getComponentFileQueryData?.message;
		if (loadedPath !== pathToLoad) {
			contents = undefined;
		} else if (contents !== undefined && loadedOverviewEntry && baseURL && getComponentFileQueryData) {
			contents = parseReadMe(contents, baseURL, getComponentFileQueryData);
		}
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoadedContents(previous =>
			previous.entryKey === openedEntryKey && previous.contents === contents
				? previous
				: { entryKey: openedEntryKey, contents }
		);
	}, [getComponentFileQueryData, pathToLoad, loadedOverviewEntry, instanceParams, openedEntryKey]);

	/*
	 Save changes.
	 */
	const { mutate: saveComponentFile, isPending: isSavingFile } = useSetComponentFile();
	const saveFile = useCallback(
		(data: SetComponentFileRequest, filePath: string) => {
			const savedKey = entryKeyOf(instanceParams.entityId, filePath);
			const bufferKey = editorFileContentKey(editorFileContentId, filePath);
			saveComponentFile(data, {
				onSuccess: () => {
					const { payload } = data;
					if (payload === undefined) {
						return;
					}
					// With the file's identity, which a cache entry that was never read lacks.
					queryClient.setQueryData<GetComponentFileResponse>(
						fileQueryKey,
						previous =>
							({ ...previous, project: data.project, file: data.file, message: payload }) as GetComponentFileResponse,
					);
					// Edits made while the save was in flight are newer than it, so they stay.
					discardEditorFileContentIfSaved(bufferKey, payload);
					if (openedEntryKeyRef.current === savedKey) {
						// '' included: an emptied file is loaded, not unknown.
						setLoadedContents({ entryKey: savedKey, contents: payload });
					}
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[editorFileContentId, fileQueryKey, instanceParams.entityId, queryClient, saveComponentFile],
	);

	const restrictPackageModification = useMemo(() => isProtectedEntry(openedEntry), [openedEntry]);

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
			openedEntryReadFailed,

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
		openedEntryReadFailed,

		saveFile,
		isSavingFile,
	]);
	return <EditorViewContext.Provider value={value}>{children}</EditorViewContext.Provider>;
}
