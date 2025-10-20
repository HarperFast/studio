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
	pkg?: string;
	content?: string; // Made optional to allow for state without content i.e. handleFileSelect()
}

export interface HandleFileSelectParams {
	filePath: string;
	projectName: string;
	content?: string; // Made optional to allow for state without content i.e. handleFileSelect()
	entries?: DirectoryEntry[]; // Optional entries for directory entries
	directoryReadMe?: DirectoryEntry;
	pkg?: string;
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
	pkg?: string;
};

export function getComponentsQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'get_components'] as const,
		queryFn: async () => {
			const { data }: { data: GetComponentsResponse } = await instanceClient.post('/', {
				operation: 'get_components',
			});
			return addMetadata(entityId, data, data.name, data.name) as GetComponentsResponseWithMetaData;
		},
		retry: false,
	});
}

function addMetadata(
	entityId: string,
	fileTree: GetComponentsResponseWithMetaData | DirectoryEntry,
	path: string,
	rootDir: string,
	pkg?: string,
): GetComponentsResponseWithMetaData | DirectoryEntry | undefined {
	if (!fileTree || !fileTree.entries) {
		return;
	}

	if (path === rootDir) {
		fileTree.path = rootDir;
		fileTree.key = `${entityId}://${fileTree.project}/${fileTree.path}`;
	}
	for (const entry of fileTree.entries ?? []) {
		const newPath = `${path}/${entry.name}`;
		const [, project] = newPath.split('/');
		entry.project = project;
		entry.path = newPath;
		entry.key = crypto.randomUUID?.() ?? Math.random().toString().slice(2);
		fileTree.key = `${entityId}://${fileTree.project}/${fileTree.path}`;
		entry.pkg = entry.package || pkg;

		addMetadata(entityId, entry, newPath, rootDir, entry.pkg);
	}
	return fileTree;
}
