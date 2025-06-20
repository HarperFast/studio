import { instanceClient } from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type DescribeTableAttribute = {
	attribute: string;
	is_primary_key?: boolean;
	type?: string;
	indexed?: boolean;
	elements?: string;
};

type DescribeTableDataResponse = {
	attributes: DescribeTableAttribute[];
	audit: boolean;
	db_audit_size: number;
	db_size: number;
	hash_attribute: string;
	last_updated_record: number;
	name: string;
	record_count: number;
	schema: string;
	schema_defined: boolean;
	sources: string[];
	table_size: number;
};

function getDescribeTableQueryOptions({
	instanceId,
	schemaName,
	tableName,
}: {
	instanceId: string;
	schemaName: string;
	tableName: string;
}) {
	return queryOptions({
		queryKey: [instanceId, 'describe_table'] as const,
		queryFn: async () => {
			const response = await instanceClient.post('/', {
				operation: 'describe_table',
				schema: schemaName,
				table: tableName,
			});
			return response.data as DescribeTableDataResponse;
		},
		enabled: !!instanceId && !!schemaName && !!tableName,
		retry: false,
	});
}

export { getDescribeTableQueryOptions };
export type { DescribeTableDataResponse, DescribeTableAttribute };
