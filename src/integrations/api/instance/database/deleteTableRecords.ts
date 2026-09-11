import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { IncompleteWrite, isMalformedHashes, UNREADABLE_WRITE_MESSAGE } from './incompleteWrite';

interface DeleteTableRecordsData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	hashValues: unknown[];
}

export interface DeleteTableRecordsResponse {
	message?: string;
	deleted_hashes?: unknown[];
	skipped_hashes?: unknown[];
}

/**
 * How the delete fell short of what was asked, or `undefined` when it didn't.
 *
 * The same shape as `describeIncompleteUpdate`, and deliberately so: `delete` answers 200 while
 * naming in `skipped_hashes` the records it couldn't address, so a 200 alone doesn't mean the rows
 * are gone. The asymmetry this removes is the one the browse view's write comment warns about --
 * update and put have read their answers since #1643; delete was still reporting every 200 as a
 * clean success.
 *
 * An ABSENT field reads as complete, because `delete` runs against every version Studio manages back
 * to 4.7 and an unrecognized legacy response isn't evidence of failure. A field that is present but
 * not an array is different: that responder does answer this operation, and its answer is unreadable.
 */
export function describeIncompleteDelete(
	data: DeleteTableRecordsResponse | undefined,
	recordCount: number,
): IncompleteWrite | undefined {
	if (isMalformedHashes(data?.deleted_hashes) || isMalformedHashes(data?.skipped_hashes)) {
		return {
			message: UNREADABLE_WRITE_MESSAGE,
			wroteNothing: false,
		};
	}
	const skipped = data?.skipped_hashes?.length ?? 0;
	// The `?? recordCount` fallback is the legacy-server reading: a responder that names no hashes at
	// all told us nothing, so assume it did what was asked. That reading does NOT hold once
	// `skipped_hashes` is populated -- this responder does answer the operation, and the records it
	// named are exactly the ones it did not delete.
	const deleted = data?.deleted_hashes?.length ?? Math.max(0, recordCount - skipped);
	if (skipped === 0 && deleted >= recordCount) {
		return undefined;
	}
	return {
		message: `Harper deleted ${deleted} of ${recordCount} records${
			skipped > 0 ? ` and skipped ${skipped}` : ''
		}. A record is skipped when nothing is stored under its primary key.`,
		wroteNothing: Array.isArray(data?.deleted_hashes) && deleted === 0,
	};
}

export async function deleteTableRecords(
	{ databaseName, tableName, hashValues, instanceClient }: DeleteTableRecordsData,
) {
	const { data } = await instanceClient.post<DeleteTableRecordsResponse>('/', {
		operation: 'delete',
		database: databaseName,
		table: tableName,
		hash_values: hashValues,
	});
	return data;
}

export function useDeleteTableRecords() {
	return useMutation({
		mutationFn: deleteTableRecords,
	});
}
