import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteTableData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
}

async function onDeleteTable({ databaseName, tableName, instanceClient }: DeleteTableData) {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_table',
		database: databaseName,
		table: tableName,
		replicated: true,
	});
	return data;
}

export function useDeleteTableMutation() {
	return useMutation({
		mutationFn: onDeleteTable,
	});
}
