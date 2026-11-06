import type { ExtensionRequest } from '@/features/instance/extensions/manifest';
import type { InstanceTable } from '@/integrations/api/api.patch';
import {
	type DeleteTableRecordsResponse,
	describeIncompleteDelete,
} from '@/integrations/api/instance/database/deleteTableRecords';
import { isMalformedHashes } from '@/integrations/api/instance/database/incompleteWrite';
import { type AxiosInstance, isAxiosError } from 'axios';

export type ExtensionRecord = Record<string, unknown>;

/** The most rows a table section loads, and the most matches a filtered count reads. */
export const EXTENSION_ROW_LIMIT = 1_000;

/**
 * How Harper refuses a whole read over one named attribute: 400 when the table has no such attribute
 * (validation/searchValidator.ts:236-297), 403 when the viewer's role scopes attributes and doesn't grant
 * it (utility/operation_authorization.ts:1349-1427, sent as a 403 by serverUtilities.ts:427-438). `'*'`
 * instead narrows to what exists and what the role may read (operation_authorization.ts:996-1024,
 * dataLayer/harperBridge/ResourceBridge.ts:743-756), so a refused projection is read again as `'*'`.
 * Line numbers are at harper 79aec74f9.
 */
const REFUSED_PROJECTION_STATUSES = new Set([400, 403]);

export interface ExtensionRows {
	records: ExtensionRecord[];
	/** More rows exist than {@link EXTENSION_ROW_LIMIT}. */
	truncated: boolean;
}

export interface ExtensionCount {
	count: number;
	/** `estimate` is Harper's budgeted count of a large table; `at-least` means the filtered count hit the limit. */
	bound: 'exact' | 'estimate' | 'at-least';
}

/**
 * Everything an extension page reads or writes goes through one of these, with the viewer's own
 * credentials, so the server's role checks apply to every request exactly as they do to Studio's own.
 */
export interface ExtensionDataSource {
	/** Distinguishes cache entries for the same table across data sources. */
	id: string;
	/** Reads only `attributes` where the server can, so a row never carries an attribute nothing shows. */
	list(database: string, table: string, primaryKey: string, attributes: readonly string[]): Promise<ExtensionRows>;
	count(database: string, table: string, where?: Record<string, unknown>): Promise<ExtensionCount>;
	/** Reads only `attributes` where the server can, as {@link ExtensionDataSource.list} does. */
	get(
		database: string,
		table: string,
		primaryKey: string,
		id: unknown,
		attributes: readonly string[],
	): Promise<ExtensionRecord | undefined>;
	/**
	 * Resolves only once Harper's answer names the record as added. `primaryKey` is how that is told: a
	 * record without a value under it is given a key by Harper.
	 */
	insert(database: string, table: string, record: ExtensionRecord, primaryKey: string): Promise<void>;
	/**
	 * Writes only the attributes `record` carries, onto the record its primary key names, and resolves only
	 * once Harper's answer names that key as updated.
	 */
	update(database: string, table: string, record: ExtensionRecord, primaryKey: string): Promise<void>;
	/** Resolves only once Harper's answer names `id` as deleted. */
	remove(database: string, table: string, id: unknown): Promise<void>;
	send(request: ExtensionRequest): Promise<unknown>;
}

/**
 * A write Harper answered without saying whether it landed. It may have, so it must not read as a plain
 * failure that invites a retry.
 */
export class UnconfirmedWriteError extends Error {}

/** Reads `attributes`, or every attribute when Harper refuses one of them by name. */
async function readProjected<T>(
	attributes: readonly string[],
	read: (getAttributes: readonly string[]) => Promise<T>,
): Promise<T> {
	const projection = attributes.length ? attributes : ['*'];
	try {
		return await read(projection);
	} catch (error) {
		const status = isAxiosError(error) ? error.response?.status : undefined;
		if (projection.includes('*') || status === undefined || !REFUSED_PROJECTION_STATUSES.has(status)) {
			throw error;
		}
		return read(['*']);
	}
}

/**
 * Throws unless Harper's answer names `id` as deleted and skips nothing. `delete` answers 200 for a key
 * it skipped, and a body without `deleted_hashes` (an empty one, or a page from something in front of
 * Harper) proves nothing either way. Harper echoes each key as it was sent
 * (dataLayer/harperBridge/ResourceBridge.ts:362-373 at harper 79aec74f9), and comparing them as JSON
 * matches a composite key that came back as a new array. Only an empty `skipped_hashes` proves nothing
 * was skipped: Harper's not-found path fills it with a count, not a key (dataLayer/delete.ts:160).
 */
function proveDeleted(answer: unknown, id: unknown): void {
	const response = answer as DeleteTableRecordsResponse | undefined;
	const incomplete = describeIncompleteDelete(response, 1);
	if (incomplete?.wroteNothing) {
		throw new Error(
			response?.skipped_hashes?.length
				? 'Harper skipped it: nothing is stored under that key any more.'
				: "Harper's answer says it deleted nothing.",
		);
	}
	if (incomplete || !response?.deleted_hashes?.some((hash) => sameKey(hash, id))) {
		throw new UnconfirmedWriteError("Harper's answer didn't say it deleted that record, so it may or may not be gone.");
	}
}

/** As JSON, so a composite key Harper sends back as a new array still matches. */
function sameKey(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

interface WriteWording {
	/** What Harper's skipping it means for this operation. */
	skipped: string;
	/** The past tense the messages use, as in "it added". */
	did: string;
}

const INSERT_WORDING: WriteWording = { skipped: 'a record with that key already exists', did: 'added' };
const UPDATE_WORDING: WriteWording = { skipped: 'nothing is stored under that key any more', did: 'saved' };

/**
 * Throws unless Harper's answer names the record as written and skips nothing, as {@link proveDeleted}
 * does for a delete. `insert` and `update` answer 200 for a record they skipped, naming it in
 * `skipped_hashes`, and list what they wrote in `inserted_hashes` / `update_hashes`
 * (dataLayer/insert.ts:284-285, :300-301 at harper 79aec74f9), as every release back to 4.7 does
 * (release_4.7.0 dataLayer/insert.js:248-259). So, unlike `describeIncompleteUpdate`'s leniency, an absent
 * list is no legacy answer: it is an empty body or a page from something in front of Harper. Harper lists
 * each written record by its key as it was sent (dataLayer/harperBridge/ResourceBridge.ts:310, :344). It
 * makes up the key of a record sent without one (resources/Resource.ts:297), which Studio can't match, so
 * there the one entry it lists is the proof.
 */
function proveWritten(
	answer: unknown,
	written: 'inserted_hashes' | 'update_hashes',
	key: unknown,
	wording: WriteWording,
) {
	const response = answer as
		| Partial<Record<'inserted_hashes' | 'update_hashes' | 'skipped_hashes', unknown>>
		| undefined;
	const hashes = response?.[written];
	const skipped = response?.skipped_hashes;
	const unconfirmed = new UnconfirmedWriteError(
		`Harper's answer didn't say it ${wording.did} that record, so it may or may not have been ${wording.did}.`,
	);
	if (!Array.isArray(hashes) || isMalformedHashes(skipped)) {
		throw unconfirmed;
	}
	const skippedAny = Array.isArray(skipped) && skipped.length > 0;
	if (!hashes.length) {
		throw new Error(
			skippedAny ? `Harper skipped it: ${wording.skipped}.` : `Harper's answer says it ${wording.did} nothing.`,
		);
	}
	// Only an insert's key can be Harper's to make up: an update without one is refused before it runs
	// (dataLayer/harperBridge/bridgeUtility/insertUpdateValidate.ts:48-50).
	const generated = written === 'inserted_hashes' && key == null;
	if (skippedAny || !(generated || hashes.some((hash) => sameKey(hash, key)))) {
		throw unconfirmed;
	}
}

/**
 * The records a search answered with. A 200 that isn't a list of them, such as a page from something in
 * front of Harper, would otherwise draw its characters as rows.
 */
function readRecords(answer: unknown): ExtensionRecord[] {
	if (
		!Array.isArray(answer)
		|| !answer.every((record) => typeof record === 'object' && record !== null && !Array.isArray(record))
	) {
		throw new Error("Harper's answer wasn't a list of records, so Studio can't show it.");
	}
	return answer;
}

/**
 * A whole table's count from `describe_table`. Harper leaves `record_count` out when its count scan
 * throws, only logging it (dataLayer/schemaDescribe.ts:278-305 at harper 79aec74f9, as release_4.7.0
 * dataLayer/schemaDescribe.js:218-237 does), so an answer without one has no count to show, not an exact 0.
 */
function readTableCount(answer: unknown): ExtensionCount {
	if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
		throw new Error("Harper's answer wasn't a table description, so Studio can't show it.");
	}
	const { record_count, estimated_record_range } = answer as Partial<InstanceTable>;
	if (typeof record_count !== 'number' || !Number.isFinite(record_count)) {
		throw new Error("Harper couldn't count this table's records.");
	}
	return { count: record_count, bound: estimated_record_range ? 'estimate' : 'exact' };
}

/** The cluster itself, through the instance client's operations API. */
export function createHarperDataSource(entityId: string, instanceClient: AxiosInstance): ExtensionDataSource {
	const operation = async (body: Record<string, unknown>) => (await instanceClient.post('/', body)).data;
	const describe = (database: string, table: string, skipRecordCount: boolean): Promise<InstanceTable> =>
		operation({
			operation: 'describe_table',
			database,
			table,
			...(skipRecordCount ? { skip_record_count: true } : {}),
		});
	return {
		id: entityId,
		list: async (database, table, primaryKey, attributes) => {
			const records = readRecords(
				await readProjected(attributes, (getAttributes) =>
					operation({
						operation: 'search_by_value',
						database,
						table,
						search_attribute: primaryKey,
						search_value: '*',
						get_attributes: getAttributes,
						limit: EXTENSION_ROW_LIMIT + 1,
					})),
			);
			return { records: records.slice(0, EXTENSION_ROW_LIMIT), truncated: records.length > EXTENSION_ROW_LIMIT };
		},
		count: async (database, table, where) => {
			const conditions = Object.entries(where ?? {});
			if (!conditions.length) {
				return readTableCount(await describe(database, table, false));
			}
			const { primary_key, hash_attribute } = await describe(database, table, true);
			const matches = readRecords(
				await operation({
					operation: 'search_by_conditions',
					database,
					table,
					conditions: conditions.map(([attribute, value]) => ({
						search_attribute: attribute,
						search_type: 'equals',
						search_value: value,
					})),
					get_attributes: [primary_key ?? hash_attribute ?? 'id'],
					limit: EXTENSION_ROW_LIMIT + 1,
				}),
			);
			return matches.length > EXTENSION_ROW_LIMIT
				? { count: EXTENSION_ROW_LIMIT, bound: 'at-least' }
				: { count: matches.length, bound: 'exact' };
		},
		get: async (database, table, primaryKey, id, attributes) => {
			const records = readRecords(
				await readProjected(
					[...new Set([primaryKey, ...attributes])],
					(getAttributes) =>
						operation({ operation: 'search_by_id', database, table, ids: [id], get_attributes: getAttributes }),
				),
			);
			return records[0];
		},
		insert: async (database, table, record, primaryKey) =>
			proveWritten(
				await operation({ operation: 'insert', database, table, records: [record] }),
				'inserted_hashes',
				record[primaryKey],
				INSERT_WORDING,
			),
		update: async (database, table, record, primaryKey) =>
			proveWritten(
				await operation({ operation: 'update', database, table, records: [record] }),
				'update_hashes',
				record[primaryKey],
				UPDATE_WORDING,
			),
		// `hash_values`, as Browse sends it: it is the key Harper's validator requires
		// (validation/deleteValidator.ts:18); `ids` works only because delete.ts:128 copies it across.
		remove: async (database, table, id) =>
			proveDeleted(await operation({ operation: 'delete', database, table, hash_values: [id] }), id),
		send: operation,
	};
}
