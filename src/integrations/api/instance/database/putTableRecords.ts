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

/**
 * Whether this instance can replace a record rather than only merge into it.
 *
 * Prereleases of the adding release read as unsupported: a `5.3.0-alpha` cut before #2347 merged
 * would take the request and merge, reporting success while keeping the attribute. Refusing costs an
 * internal alpha user a clear, actionable message; accepting wrongly restores #1643 silently. The
 * role catalog floors the same operation at the earliest prerelease instead, because an unusable
 * grant there is inert — see the note beside its entry.
 */
export function supportsPutOperation(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(PUT_OPERATION_MIN_VERSION, version);
}

/** Why a record can't be replaced, or `undefined` when it can. */
export type ReplaceBlockedReason = 'unknown' | 'version' | 'permission';

/**
 * Whether this instance and role can replace a record, and if not, which answer the user needs.
 *
 * `unknown` is deliberately distinct from `version`: an unresolved or failed `registration_info` is
 * not an old server, and reporting it as one sends the user to upgrade something that may already be
 * new enough. Version is checked before grants so an old instance never reads as a permission
 * problem — nothing can be granted there.
 */
export function replaceRecordsBlockedReason(
	version: string | undefined,
	hasReplaceGrants: boolean,
): ReplaceBlockedReason | undefined {
	if (version === undefined) {
		return 'unknown';
	}
	if (!supportsPutOperation(version)) {
		return 'version';
	}
	return hasReplaceGrants ? undefined : 'permission';
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
	// The premise of this whole path is that a write which didn't land must never read as success, so
	// the answer is checked rather than assumed. `put_hashes` names the records actually written; a
	// short list means some record wasn't, and the caller would otherwise close the editor and report
	// success while the attribute is still there — #1643 again, by a different cause.
	//
	// The `message` is no help here: `dataLayer/insert.ts` builds it as `put N of N` from
	// `written_hashes.length` for both halves (`skipped` is always `[]` for put), so it can never
	// report a partial write. Length is the only signal the response actually carries.
	// Fails CLOSED on a missing or malformed list. `put` is only ever sent to a 5.3+ instance, and
	// `dataLayer/insert.ts` always sets `put_hashes` for a `put`, so a 200 without one didn't come
	// from a healthy Harper answering this operation — reporting success on it is the assumption this
	// check exists to remove.
	if (!Array.isArray(data?.put_hashes)) {
		throw new Error(
			"Harper's response didn't report which records it wrote, so the change may not have been saved.",
		);
	}
	if (data.put_hashes.length < records.length) {
		throw new Error(
			`Harper reported writing ${data.put_hashes.length} of ${records.length} records, so the change may not have been saved.`,
		);
	}
	return data;
}

export function usePutTableRecords() {
	return useMutation({
		mutationFn: putTableRecords,
	});
}
