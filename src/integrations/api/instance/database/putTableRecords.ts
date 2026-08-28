import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useMutation } from '@tanstack/react-query';

/**
 * The Harper release that added the `put` operation (HarperFast/harper#2347). Before it, the
 * operations API could only merge — `update` and `upsert` both land on `Table.patch`, so an
 * attribute left out of the payload keeps its stored value and `null` stores a null, which is why
 * removing a property silently did nothing (#1643).
 */
export const PUT_OPERATION_MIN_VERSION = '5.3.0';

/** Whether this instance can replace a record rather than only merge into it. */
export function supportsPutOperation(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(PUT_OPERATION_MIN_VERSION, version);
}

interface PutTableRecordsData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	records: object[];
}

export interface PutTableRecordsResponse {
	message: string;
	put_hashes: unknown[];
}

/**
 * Create-or-replace: the stored record becomes exactly what is sent, so an attribute omitted from
 * `records` is removed. One write, so unlike the delete-then-insert a client would otherwise need,
 * the record is never absent in between, `__createdtime__` survives, and subscribers see a single
 * write instead of a delete followed by an insert.
 */
export async function putTableRecords({ databaseName, tableName, records, instanceClient }: PutTableRecordsData) {
	const { data } = await instanceClient.post<PutTableRecordsResponse>('/', {
		operation: 'put',
		database: databaseName,
		table: tableName,
		records,
	});
	return data;
}

export function usePutTableRecords() {
	return useMutation({
		mutationFn: putTableRecords,
	});
}
