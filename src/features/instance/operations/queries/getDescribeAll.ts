import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type DescribeAllResponse = {
	[key: string]: {
		[key: string]: object;
	};
};

function getDescribeAllQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [instanceId, 'describe_all'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'describe_all',
			});
			return data as DescribeAllResponse;
		},
		retry: false,
	});
}

export { getDescribeAllQueryOptions };
export type { DescribeAllResponse };
