import { instanceClient } from '@/config/instanceClient';

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

function getComponentFileQuery(getComponentFileRequest: GetComponentFileRequest) {
	return queryOptions({
		queryKey: ['get_component_file'] as const,
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
		enabled: false, // Disable by default
		retry: false,
	});
}

export { getComponentFileQuery };
export type { GetComponentFileResponse };
