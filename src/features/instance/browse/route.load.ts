import { QueryClient } from '@tanstack/react-query';
import { getDescribeAllQueryOptions } from '@/features/instance/operations/queries/getDescribeAll';
import { redirect } from '@tanstack/react-router';

export async function loadInstanceBrowseData(
	queryClient: QueryClient,
	params: {
		clusterId?: string;
		instanceId?: string;
		schemaName?: string;
		tableName?: string;
	}
) {
	const data = await queryClient.ensureQueryData(getDescribeAllQueryOptions(params.instanceId ?? params.clusterId));
	let newSchemaName: string | undefined;
	let newTableName: string | undefined;
	if (data) {
		if (!params.schemaName) {
			newSchemaName = Object.keys(data).sort()[0];
		}
		const schemaName = params.schemaName ?? newSchemaName;
		if (!params.tableName && schemaName && data[schemaName]) {
			newTableName = Object.keys(data[schemaName]).sort()[0];
		}
	}
	if (newSchemaName || newTableName) {
		const to = [
			params.schemaName ? '..' : '',
			params.tableName ? '..' : '',
			newSchemaName ?? params.schemaName,
			newTableName,
		]
			.filter(Boolean)
			.join('/');
		throw redirect({ to });
	}
	return data;
}
