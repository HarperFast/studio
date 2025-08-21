import { getInstanceClient } from '@/config/getInstanceClient';
import { getDescribeAllQueryOptions } from '@/features/instance/operations/queries/getDescribeAll';
import { OverallAppSignIn } from '@/lib/authStore';
import { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

export async function loadInstanceBrowseData(
	queryClient: QueryClient,
	params: {
		clusterId?: string;
		instanceId?: string;
		databaseName?: string;
		tableName?: string;
	},
	preload: boolean,
) {
	const entityId = params.instanceId ?? params.clusterId ?? OverallAppSignIn;
	const data = await queryClient.ensureQueryData(getDescribeAllQueryOptions({
		entityId,
		instanceClient: getInstanceClient({ id: entityId }),
	}));
	let newDatabaseName: string | undefined;
	let newTableName: string | undefined;
	if (data) {
		if (!params.databaseName) {
			newDatabaseName = Object.keys(data).sort()[0];
		}
		const databaseName = params.databaseName ?? newDatabaseName;
		if (!params.tableName && databaseName && data[databaseName]) {
			newTableName = Object.keys(data[databaseName]).sort()[0];
		}
	}
	if (newDatabaseName || newTableName) {
		const to = [
			params.databaseName ? '..' : '',
			params.tableName ? '..' : '',
			newDatabaseName ?? params.databaseName,
			newTableName,
		]
			.filter(Boolean)
			.join('/');
		if (!preload) {
			throw redirect({ to });
		}
	}
	return data;
}
