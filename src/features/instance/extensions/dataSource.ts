import { type ExtensionRequest, isRestRequest } from '@/features/instance/extensions/manifest';
import { isSameOriginPath } from '@/features/instance/extensions/parseStudioConfiguration';
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

/** The cluster itself: operations through the instance client, REST through the application URL. */
export function createHarperDataSource(
	entityId: string,
	instanceClient: AxiosInstance,
	restUrl: string | null,
): ExtensionDataSource {
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
		send: async (request) => {
			if (isRestRequest(request)) {
				// Through the instance client, so it carries the same credential as every operation (a direct
				// connection's Bearer, or Basic) and passes the same restart gate. An absolute URL overrides
				// the client's operations baseURL, which is why the origin is checked first.
				const { data } = await instanceClient.request({
					url: resolveClusterUrl(request.rest.path, restUrl).toString(),
					method: request.rest.method,
					data: request.rest.body,
				});
				return data;
			}
			return operation(request);
		},
	};
}

/**
 * A page's REST path, resolved against the cluster's application URL, refused unless it stays on that
 * origin. The manifest parser already rejects paths that could leave it; this is the check at the point
 * of sending, where a credential would otherwise go along.
 */
export function resolveClusterUrl(path: string, restUrl: string | null): URL {
	if (!restUrl) {
		throw new Error('This cluster has no application URL to send the request to.');
	}
	const base = new URL(restUrl);
	const url = new URL(path, base);
	if (!isSameOriginPath(path) || url.origin !== base.origin) {
		throw new Error(`${path} is not on this cluster's application URL.`);
	}
	return url;
}
