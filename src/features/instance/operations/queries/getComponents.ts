import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type DirectoryEntry = {
	entries?: DirectoryEntry[];
	name: string;
	mtime?: string;
	package?: string;
	error?: string;
	key?: string;
	path?: string;
	project?: string;
	readOnly?: boolean;
};

type GetComponentsResponse = {
	entries: DirectoryEntry[];
	name: string;
};
type GetComponentsResponseWithMetaData = GetComponentsResponse & {
	error?: string;
	key?: string;
	path?: string;
	project?: string;
	readOnly?: boolean;
};

function addMetadata(
	fileTree: GetComponentsResponseWithMetaData | DirectoryEntry,
	path: string,
	rootDir: string,
	readOnly = false
): GetComponentsResponseWithMetaData | DirectoryEntry | undefined {
	if (!fileTree || !fileTree.entries) {
		return;
	}

	if (path === rootDir) {
		fileTree.path = rootDir;
		fileTree.key = crypto.randomUUID?.() ?? Math.random().toString().slice(2);
	}
	for (const entry of fileTree.entries ?? []) {
		/*
		 * adds 3 properties to directory entry:
		 *   - project, which is the dir under component root on the instance
		 *   - path, which is the file path relative to the project
		 *   - unique key for react dynamic list optimization
		 */

		const newPath = `${path}/${entry.name}`;
		const [, project] = newPath.split('/');
		entry.project = project;
		entry.path = newPath;
		entry.key = crypto.randomUUID?.() ?? Math.random().toString().slice(2);
		entry.readOnly = readOnly || !!entry.package;

		addMetadata(entry, newPath, rootDir, entry.readOnly);
	}
	return fileTree;
}

function getComponentsQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'get_components'] as const,
		queryFn: async () => {
			const { data }: { data: GetComponentsResponse } = await instanceClient.post('/', {
				operation: 'get_components',
			});
			const dataWithMetadata = addMetadata(data, data.name, data.name, false) as GetComponentsResponseWithMetaData;
			return dataWithMetadata;
		},
		retry: false,
	});
}

export { getComponentsQueryOptions };
export type { GetComponentsResponse, DirectoryEntry };
