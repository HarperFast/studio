import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface DirectoryEntry {
	entries?: DirectoryEntry[];
	name: string;
	mtime?: string;
	package?: string;
	error?: string;
	key?: string;
	path?: string;
	project?: string;
	readOnly?: boolean;
}

export interface HandleFileSelectParams {
	filePath: string;
	projectName: string;
	content?: string; // Made optional to allow for state without content i.e. handleFileSelect()
	entries?: DirectoryEntry[]; // Optional entries for directory entries
}

export interface GetComponentsResponse {
	entries: DirectoryEntry[];
	name: string;
}

type GetComponentsResponseWithMetaData = GetComponentsResponse & {
	error?: string;
	key?: string;
	path?: string;
	project?: string;
	readOnly?: boolean;
};

export function getComponentsQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'get_components'] as const,
		queryFn: async () => {
			const { data }: { data: GetComponentsResponse } = await instanceClient.post('/', {
				operation: 'get_components',
			});
			return addMetadata(data, data.name, data.name, false) as GetComponentsResponseWithMetaData;
		},
		retry: false,
	});
}

function addMetadata(
	fileTree: GetComponentsResponseWithMetaData | DirectoryEntry,
	path: string,
	rootDir: string,
	readOnly = false,
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
