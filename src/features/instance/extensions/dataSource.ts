import type { ExtensionRequest } from '@/features/instance/extensions/manifest';
import type { AxiosInstance } from 'axios';

export type ExtensionRecord = Record<string, unknown>;

/**
 * Everything an extension page reads or writes goes through one of these, with the viewer's own
 * credentials, so the server's role checks apply to every request exactly as they do to Studio's own.
 */
export interface ExtensionDataSource {
	/** Distinguishes cache entries for the same table across data sources. */
	id: string;
	list(database: string, table: string, primaryKey: string): Promise<ExtensionRecord[]>;
	get(database: string, table: string, primaryKey: string, id: unknown): Promise<ExtensionRecord | undefined>;
	upsert(database: string, table: string, record: ExtensionRecord): Promise<void>;
	remove(database: string, table: string, id: unknown): Promise<void>;
	send(request: ExtensionRequest): Promise<unknown>;
}

/** The cluster itself, through the instance client's operations API. */
export function createHarperDataSource(entityId: string, instanceClient: AxiosInstance): ExtensionDataSource {
	const operation = async (body: Record<string, unknown>) => (await instanceClient.post('/', body)).data;
	return {
		id: entityId,
		list: (database, table, primaryKey) =>
			operation({
				operation: 'search_by_value',
				database,
				table,
				search_attribute: primaryKey,
				search_value: '*',
				get_attributes: ['*'],
			}),
		get: async (database, table, _primaryKey, id) =>
			(await operation({ operation: 'search_by_id', database, table, ids: [id], get_attributes: ['*'] }))[0],
		upsert: async (database, table, record) => {
			await operation({ operation: 'upsert', database, table, records: [record] });
		},
		remove: async (database, table, id) => {
			await operation({ operation: 'delete', database, table, ids: [id] });
		},
		send: operation,
	};
}
