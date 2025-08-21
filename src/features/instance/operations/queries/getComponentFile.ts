import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

interface GetComponentFileRequest extends InstanceClientIdConfig {
	file: string | undefined;
	project: string;
}

interface GetComponentFileResponse {
	file: string;
	project: string;
	birthtime: string;
	message: string;
	mtime: string;
	size: number;
}

export function getComponentFileQueryOptions({ entityId, instanceClient, file, project }: GetComponentFileRequest) {
	return queryOptions({
		queryKey: [
			entityId,
			queryKeys.operations.get_component_file,
			file,
			project,
		] as const,
		queryFn: async (): Promise<GetComponentFileResponse> => {
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
		},
		enabled: !!file,
		retry: false,
	});
}
