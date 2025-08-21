import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface UpdateTableRecordsParams extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	records: object[];
}

async function onUpdateTableRecords(recordsData: UpdateTableRecordsParams) {
	const { databaseName, tableName, records, instanceClient } = recordsData;
	const { data } = await instanceClient.post('/', {
		operation: 'update',
		database: databaseName,
		table: tableName,
		records: records,
	});
	return data;
}

export function useUpdateTableRecords() {
	return useMutation({
		mutationFn: onUpdateTableRecords,
	});
}
