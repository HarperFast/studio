import type { ExtensionRequest } from '@/features/instance/extensions/manifest';
import type { InstanceTable } from '@/integrations/api/api.patch';
import type { AxiosInstance } from 'axios';

export type ExtensionRecord = Record<string, unknown>;

/** The most rows a table section loads, and the most matches a filtered count reads. */
export const EXTENSION_ROW_LIMIT = 1_000;

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
	list(database: string, table: string, primaryKey: string): Promise<ExtensionRows>;
	count(database: string, table: string, where?: Record<string, unknown>): Promise<ExtensionCount>;
	get(database: string, table: string, primaryKey: string, id: unknown): Promise<ExtensionRecord | undefined>;
	insert(database: string, table: string, record: ExtensionRecord): Promise<void>;
	/** Writes only the attributes `record` carries, onto the record its primary key names. */
	update(database: string, table: string, record: ExtensionRecord): Promise<void>;
	remove(database: string, table: string, id: unknown): Promise<void>;
	send(request: ExtensionRequest): Promise<unknown>;
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
		list: async (database, table, primaryKey) => {
			const records: ExtensionRecord[] = await operation({
				operation: 'search_by_value',
				database,
				table,
				search_attribute: primaryKey,
				search_value: '*',
				get_attributes: ['*'],
				limit: EXTENSION_ROW_LIMIT + 1,
			});
			return { records: records.slice(0, EXTENSION_ROW_LIMIT), truncated: records.length > EXTENSION_ROW_LIMIT };
		},
		count: async (database, table, where) => {
			const conditions = Object.entries(where ?? {});
			if (!conditions.length) {
				const { record_count = 0, estimated_record_range } = await describe(database, table, false);
				return { count: record_count, bound: estimated_record_range ? 'estimate' : 'exact' };
			}
			const { primary_key, hash_attribute } = await describe(database, table, true);
			const matches: unknown[] = await operation({
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
			});
			return matches.length > EXTENSION_ROW_LIMIT
				? { count: EXTENSION_ROW_LIMIT, bound: 'at-least' }
				: { count: matches.length, bound: 'exact' };
		},
		get: async (database, table, _primaryKey, id) =>
			(await operation({ operation: 'search_by_id', database, table, ids: [id], get_attributes: ['*'] }))[0],
		// Harper answers a write it skipped with a 200 that names the record in `skipped_hashes`.
		insert: async (database, table, record) => {
			const result = await operation({ operation: 'insert', database, table, records: [record] });
			if (result?.skipped_hashes?.length) {
				throw new Error('Harper skipped it: a record with that key already exists.');
			}
		},
		update: async (database, table, record) => {
			const result = await operation({ operation: 'update', database, table, records: [record] });
			if (result?.skipped_hashes?.length) {
				throw new Error('Harper skipped it: nothing is stored under that key any more.');
			}
		},
		remove: async (database, table, id) => {
			await operation({ operation: 'delete', database, table, ids: [id] });
		},
		send: operation,
	};
}
