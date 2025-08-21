import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteTableRecordsData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	hashValues: unknown[];
}

async function onDeleteTableRecords({ databaseName, tableName, hashValues, instanceClient }: DeleteTableRecordsData) {
	const { data } = await instanceClient.post('/', {
		operation: 'delete',
		database: databaseName,
		table: tableName,
		hash_values: hashValues,
	});
	return data;
}

export function useDeleteTableRecords() {
	return useMutation({
		mutationFn: onDeleteTableRecords,
	});
}
