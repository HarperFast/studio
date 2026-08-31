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

/** Present, but not the array of hashes this operation is documented to return. */
function isMalformedHashes(value: unknown): boolean {
	return value !== undefined && !Array.isArray(value);
}

export async function updateTableRecords(recordsData: UpdateTableRecordsParams) {
	const { databaseName, tableName, records, instanceClient } = recordsData;
	const { data } = await instanceClient.post<UpdateTableRecordsResponse>('/', {
		operation: 'update',
		database: databaseName,
		table: tableName,
		records: records,
	});
	// `update` skips a record it can't address — nothing stored under that key — and answers 200 with
	// it named in `skipped_hashes` (`dataLayer/insert.ts`), so a write that changed nothing must not
	// read as success (studio#1643).
	//
	// An ABSENT field is tolerated, because `update` runs against every version Studio manages back
	// to 4.7 and an unrecognized legacy response is not evidence of failure. A field that is present
	// but not an array is a different thing: the response came from something that answers this
	// operation and its answer is unreadable, so nothing here can claim the write landed.
	if (isMalformedHashes(data?.update_hashes) || isMalformedHashes(data?.skipped_hashes)) {
		throw new Error(
			"Harper's response didn't report which records it wrote, so the change may not have been saved.",
		);
	}
	const skipped = data?.skipped_hashes?.length ?? 0;
	const written = data?.update_hashes?.length ?? records.length;
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
