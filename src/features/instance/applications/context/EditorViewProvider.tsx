import { useEntityRestURL } from '@/config/useEntityRestURL';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import {
	calculateRootEntries,
} from '@/features/instance/applications/components/ApplicationsSidebar/calculateRootEntries';
import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { parseReadMe } from '@/features/instance/applications/lib/parseReadMe';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import {
	getComponentFileQueryKey,
	getComponentFileQueryOptions,
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
import { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TreeItemIndex } from 'react-complex-tree/src/types';
import { DirectoryEntry } from './directoryEntry';
import { EditorViewContext, EditorViewContextValue } from './EditorViewContext';
import { FileEntry } from './fileEntry';
import { isDirectory } from './isDirectory';
import { isProtectedEntry } from './isProtectedComponentPackage';

/** An entry's loaded contents, tagged with the path of the entry they belong to. */
interface LoadedContents {
	entryPath: string | undefined;
	contents: string | undefined;
}

export function EditorViewProvider({ children }: PropsWithChildren) {
	const navigate = useNavigate();
	const [openedEntry, setOpenedEntry] = useState<DirectoryEntry | FileEntry | undefined>(undefined);
	const openedEntryPath = openedEntry?.path;
	const openedEntryPathRef = useRef(openedEntryPath);
	openedEntryPathRef.current = openedEntryPath;
	// Contents are kept with the entry they were loaded for, and handed out only while that entry is
	// open. They load in an effect, and a parent's effects run after its children's, so for the
	// first render after a switch (and every effect it runs) the state still holds the previous
	// entry's contents. An editor mounting then adopted them as the new file's — a new, empty
	// .graphql file opened from a folder took the folder's README as its schema (#1929).
	const [loadedContents, setLoadedContents] = useState<LoadedContents>({ entryPath: undefined, contents: undefined });
	const openedEntryContents = loadedContents.entryPath === openedEntryPath ? loadedContents.contents : undefined;
	const setOpenedEntryContents = useCallback<EditorViewContextValue['setOpenedEntryContents']>(contents => {
		setLoadedContents(previous => ({
			entryPath: openedEntryPath,
			contents: typeof contents === 'function'
				? contents(previous.entryPath === openedEntryPath ? previous.contents : undefined)
				: contents,
		}));
	}, [openedEntryPath]);
	const { setContent: setUpdatedEntryContents } = useEditorFileContent(openedEntryPath);
	const instanceParams = useInstanceClientIdParams();
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
	const { data: getComponentFileQueryData } = useQuery(
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
			previous.entryPath === openedEntryPath && previous.contents === contents
				? previous
				: { entryPath: openedEntryPath, contents }
		);
	}, [getComponentFileQueryData, pathToLoad, loadedOverviewEntry, instanceParams, openedEntryPath]);

	/*
	 Save changes.
	 */
	const { mutate: saveComponentFile, isPending: isSavingFile } = useSetComponentFile();
	const saveFile = useCallback(
		(data: SetComponentFileRequest, filePath: string) => {
			saveComponentFile(data, {
				onSuccess: () => {
					// The live path, not this closure's: once another entry is open, the buffer setter
					// below is that entry's.
					const { payload } = data;
					if (openedEntryPathRef.current === filePath && payload !== undefined) {
						// Edits made while the save was in flight aren't saved yet, so they stay.
						setUpdatedEntryContents(current => current === payload ? undefined : current);
						// An emptied file is still loaded: its contents are '', not unknown.
						setLoadedContents({ entryPath: filePath, contents: payload });
						queryClient.setQueryData(fileQueryKey, { ...getComponentFileQueryData, message: payload });
					}
				},
				onError: (error) => {
					console.error('Error saving file:', error);
				},
			});
		},
		[
			fileQueryKey,
			getComponentFileQueryData,
			queryClient,
			saveComponentFile,
			setUpdatedEntryContents,
		],
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
