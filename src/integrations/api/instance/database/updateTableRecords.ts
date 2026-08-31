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

/**
 * How the write fell short of what was asked, or `undefined` when it didn't.
 *
 * `update` skips a record it can't address — nothing stored under that key — and answers 200 with it
 * named in `skipped_hashes` (`dataLayer/insert.ts`), so a 200 alone doesn't mean the change landed
 * (studio#1643).
 *
 * Returned rather than thrown, and deliberately not applied inside `updateTableRecords`: this is a
 * statement about what a *user* should be told, and the writer is shared with the chat agent tool,
 * which needs the response (`skipped_hashes` included) and its own cache invalidation to still run on
 * a partial write. Callers that report success to a person apply this; callers that report data don't.
 *
 * An ABSENT field reads as complete, because `update` runs against every version Studio manages back
 * to 4.7 and an unrecognized legacy response isn't evidence of failure. A field that is present but
 * not an array is different: that responder does answer this operation, and its answer is unreadable.
 */
export interface IncompleteUpdate {
	message: string;
	/**
	 * True only when the response says plainly that nothing was written. A caller can then skip its
	 * cache invalidation: there is nothing new to read, and refetching would reset an editor that
	 * still holds the user's draft. Undecidable answers leave this false, so the caller refreshes.
	 */
	wroteNothing: boolean;
}

export function describeIncompleteUpdate(
	data: UpdateTableRecordsResponse | undefined,
	recordCount: number,
): IncompleteUpdate | undefined {
	if (isMalformedHashes(data?.update_hashes) || isMalformedHashes(data?.skipped_hashes)) {
		return {
			message: "Harper's response didn't report which records it wrote, so the change may not have been saved.",
			wroteNothing: false,
		};
	}
	const skipped = data?.skipped_hashes?.length ?? 0;
	const written = data?.update_hashes?.length ?? recordCount;
	if (skipped === 0 && written >= recordCount) {
		return undefined;
	}
	return {
		message: `Harper updated ${written} of ${recordCount} records${
			skipped > 0 ? ` and skipped ${skipped}` : ''
		}. A record is skipped when nothing is stored under its primary key.`,
		wroteNothing: Array.isArray(data?.update_hashes) && written === 0,
	};
}

export async function updateTableRecords(recordsData: UpdateTableRecordsParams) {
	const { databaseName, tableName, records, instanceClient } = recordsData;
	const { data } = await instanceClient.post<UpdateTableRecordsResponse>('/', {
		operation: 'update',
		database: databaseName,
		table: tableName,
		records: records,
	});
	return data;
}

export function useUpdateTableRecords() {
	return useMutation({
		mutationFn: updateTableRecords,
	});
}
