import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type DBTableInfo = {
	record_count: number;
	hash_attribute: string;
	[key: string]: unknown;
};

type DescribeAllResponse = {
	[key: string]: {
		[key: string]: DBTableInfo;
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
