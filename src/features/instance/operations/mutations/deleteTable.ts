import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

interface DeleteTableData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	replicated: boolean;
}

async function onDeleteTable({ databaseName, tableName, replicated, instanceClient }: DeleteTableData): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_table',
		database: databaseName,
		table: tableName,
		replicated,
	});
	return data;
}

export function useDeleteTableMutation() {
	return useMutation({
		mutationFn: onDeleteTable,
	});
}
