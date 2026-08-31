import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useMutation } from '@tanstack/react-query';
import { IncompleteWrite, UNREADABLE_WRITE_MESSAGE } from './incompleteWrite';

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
export type ReplaceBlockedReason = 'version' | 'permission';

/**
 * Whether this instance and role can replace a record, and if not, which answer the user needs.
 *
 * An unreadable version does NOT block the save. Harper denies `registration_info` to any role
 * carrying an `operations` allowlist — see the gate-inert list in
 * `features/instance/config/roles/operations/operationsCatalog.ts` — which is exactly the shape of
 * role `checkTablePutPermission` exists to accept. Treating an unread version as unsupported made the
 * feature permanently unavailable for those roles, behind a "reload and try again" that never helps.
 *
 * Allowing it is safe because the fallback isn't a silent one: `put` is a distinct operation name, so
 * a pre-5.3 instance rejects the request outright rather than merging and keeping the attribute. The
 * original reason for erring strict — that guessing wrong sends an `update` which reports success
 * while the attribute stays — doesn't apply to an operation the old server doesn't recognize.
 *
 * A version we CAN read that predates the operation still blocks, since a clear message beats a
 * wasted round trip. Grants are checked first, so a missing grant is never reported as a version
 * problem.
 */
export function replaceRecordsBlockedReason(
	version: string | undefined,
	hasReplaceGrants: boolean,
): ReplaceBlockedReason | undefined {
	if (!hasReplaceGrants) {
		return 'permission';
	}
	if (version !== undefined && !supportsPutOperation(version)) {
		return 'version';
	}
	return undefined;
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
	return data;
}

/**
 * How the replace fell short of what was asked, or `undefined` when it didn't.
 *
 * `put_hashes` names the records actually written. A short list means some record wasn't, and a
 * missing or malformed one means this didn't come from a healthy 5.3 Harper answering this operation
 * (`dataLayer/insert.ts` always sets the field) — either way the caller must not report success.
 *
 * The `message` is no help: `insert.ts` builds it as `put N of N` from `written_hashes.length` for
 * both halves (`skipped` is always `[]` for put), so it can never report a partial write.
 *
 * Returned rather than thrown, and applied at the call site, for the same reason `update` does it:
 * a throw skips the caller's cache invalidation, so a write that landed but answered unreadably would
 * leave the grid and the open editor serving pre-write data.
 */
export function describeIncompletePut(
	data: PutTableRecordsResponse | undefined,
	recordCount: number,
): IncompleteWrite | undefined {
	if (!Array.isArray(data?.put_hashes)) {
		return { message: UNREADABLE_WRITE_MESSAGE, wroteNothing: false };
	}
	if (data.put_hashes.length >= recordCount) {
		return undefined;
	}
	return {
		message:
			`Harper reported writing ${data.put_hashes.length} of ${recordCount} records, so the change may not have been saved.`,
		wroteNothing: data.put_hashes.length === 0,
	};
}

export function usePutTableRecords() {
	return useMutation({
		mutationFn: putTableRecords,
	});
}
