import { instanceClient } from '@/config/instanceClient';
import { queryKeys } from '@/react-query/constants';

import { queryOptions } from '@tanstack/react-query';

type GetComponentFileRequest = {
	file: string;
	project: string;
};

type GetComponentFileResponse = {
	file: string;
	project: string;
	birthtime: string;
	message: string;
	mtime: string;
	size: number;
};

function getComponentFileQuery(getComponentFileRequest: GetComponentFileRequest, instanceId: string) {
	return queryOptions({
		queryKey: [
			instanceId,
			queryKeys.operations.get_component_file,
			getComponentFileRequest.file,
			getComponentFileRequest.project,
		] as const,
		queryFn: async () => {
			const { data }: { data: GetComponentFileResponse } = await instanceClient.post('/', {
				operation: 'get_component_file',
				...getComponentFileRequest,
			});
			return {
				...getComponentFileRequest,
				...data,
			};
		},
		enabled: !!getComponentFileRequest.file,
		retry: false,
	});
}

export { getComponentFileQuery };
export type { GetComponentFileResponse };
