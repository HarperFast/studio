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
 * `deleted_hashes` is required, the same way `describeIncompletePut` requires `put_hashes`: `delete`
 * has answered with it since 4.7.33, so an absent one is not a legacy responder but an empty body or
 * an HTML 2xx from something in front of Harper, and reporting that as a clean delete would claim
 * rows are gone on no evidence at all. `skipped_hashes` only adds detail, so an absent one reads as
 * "nothing skipped" rather than turning a provable delete into an error; present-but-not-an-array
 * is unreadable either way.
 */
export function describeIncompleteDelete(
	data: DeleteTableRecordsResponse | undefined,
	recordCount: number,
): IncompleteWrite | undefined {
	if (!Array.isArray(data?.deleted_hashes) || isMalformedHashes(data?.skipped_hashes)) {
		return {
			message: UNREADABLE_WRITE_MESSAGE,
			wroteNothing: false,
		};
	}
	const skipped = data.skipped_hashes?.length ?? 0;
	const deleted = data.deleted_hashes.length;
	if (skipped === 0 && deleted >= recordCount) {
		return undefined;
	}
	return {
		message: `Harper deleted ${deleted} of ${recordCount} records${
			skipped > 0 ? ` and skipped ${skipped}` : ''
		}. A record is skipped when nothing is stored under its primary key.`,
		wroteNothing: deleted === 0,
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
