import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface UpdateTableRecordsParams extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	records: object[];
}

export interface UpdateTableRecordsResponse {
	message?: string;
	update_hashes?: unknown[];
	skipped_hashes?: unknown[];
}

export async function updateTableRecords(recordsData: UpdateTableRecordsParams) {
	const { databaseName, tableName, records, instanceClient } = recordsData;
	const { data } = await instanceClient.post<UpdateTableRecordsResponse>('/', {
		operation: 'update',
		database: databaseName,
		table: tableName,
		records: records,
	});
	// `update` skips a record it can't address — no stored record under that key — and answers 200
	// with it named in `skipped_hashes` (`dataLayer/insert.ts`). Nothing read that, so a write which
	// changed nothing closed the editor and reported success, which is the studio#1643 symptom by a
	// different cause.
	//
	// Unlike the `put` check this fails OPEN on a missing field: `update` runs against every version
	// Studio manages, back to 4.7, so an absent key can't be assumed to mean a bad response.
	const skipped = Array.isArray(data?.skipped_hashes) ? data.skipped_hashes.length : 0;
	const written = Array.isArray(data?.update_hashes) ? data.update_hashes.length : records.length;
	if (skipped > 0 || written < records.length) {
		throw new Error(
			`Harper updated ${written} of ${records.length} records${
				skipped > 0 ? ` and skipped ${skipped}` : ''
			}, so the change may not have been saved. A record is skipped when nothing is stored under its primary key.`,
		);
	}
	return data;
}

export function useUpdateTableRecords() {
	return useMutation({
		mutationFn: updateTableRecords,
	});
}
