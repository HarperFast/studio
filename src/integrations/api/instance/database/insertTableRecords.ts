import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface InsertTableRecordsData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	records: object[];
}

interface InsertTableRecordsResponse {
	message: string;
	inserted_hashes: string[];
	skipped_hashes: string[];
}

async function onInsertTableRecords({ databaseName, tableName, records, instanceClient }: InsertTableRecordsData) {
	const { data } = await instanceClient.post<InsertTableRecordsResponse>('/', {
		operation: 'insert',
		database: databaseName,
		table: tableName,
		records: records,
	});
	return data;
}

export function useInsertTableRecords() {
	return useMutation({
		mutationFn: onInsertTableRecords,
	});
}
