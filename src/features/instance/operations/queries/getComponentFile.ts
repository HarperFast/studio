import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface GetComponentFileRequest extends InstanceClientIdConfig {
	file: string | undefined;
	project: string | undefined;
}

export interface GetComponentFileResponse {
	file: string;
	project: string;
	birthtime: string;
	message: string;
	mtime: string;
	size: number;
}

export async function getComponentFile({
	instanceClient,
	file,
	project,
}: GetComponentFileRequest): Promise<GetComponentFileResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'get_component_file',
		file,
		project,
	});
	return {
		file,
		project,
		...data,
	};
}

export function getComponentFileQueryOptions(params: GetComponentFileRequest) {
	return queryOptions({
		queryKey: getComponentFileQueryKey(params),
		queryFn: () => getComponentFile(params),
		enabled: !!params.file && !!params.project,
		retry: false,
	});
}

export function getComponentFileQueryKey(params: GetComponentFileRequest) {
	return [
		params.entityId,
		"get_component_file",
		params.file,
		params.project,
	] as const;
}
