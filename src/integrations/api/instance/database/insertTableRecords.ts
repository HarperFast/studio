import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface InsertTableRecordsData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	records: object[];
}

export interface InsertTableRecordsResponse {
	message: string;
	inserted_hashes: string[];
	skipped_hashes: string[];
}

export async function insertTableRecords({ databaseName, tableName, records, instanceClient }: InsertTableRecordsData) {
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
		mutationFn: insertTableRecords,
	});
}
