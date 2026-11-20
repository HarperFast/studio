/**
 * The records whose vector is nearest a target, nearest first, through `search_by_value` on the primary
 * key with `'*'` and an HNSW `sort: { attribute, target }`. `search_by_conditions` can't carry it: it
 * needs a condition, and drops a condition's `target` (harper `dataLayer/harperBridge/ResourceBridge.ts`,
 * the same in 4.7.42 and 5.4.1).
 *
 * Harper doesn't check the target's length: it pads the shorter vector with zeros and ranks by that
 * (`resources/indexes/vector.ts`). So the target is always a vector read from the table itself.
 */
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { throwIfStreamFailed } from '@/integrations/api/instance/database/searchStreamError';

export interface NearestRecordsParams extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	primaryKey: string;
	attribute: string;
	target: number[];
	/** Read besides the key and `$distance`; never `'*'`, which would bring every vector back. */
	previewAttributes: string[];
	limit: number;
}

export type NearestRecord = Record<string, unknown> & { $distance?: unknown };

export function buildNearestRecordsRequest(
	{ databaseName, tableName, primaryKey, attribute, target, previewAttributes, limit }: Omit<
		NearestRecordsParams,
		'instanceClient'
	>,
) {
	return {
		operation: 'search_by_value',
		database: databaseName,
		table: tableName,
		search_attribute: primaryKey,
		search_value: '*',
		get_attributes: ['$distance', primaryKey, ...previewAttributes],
		sort: { attribute, target },
		limit,
	};
}

export async function searchNearestRecords(
	{ instanceClient, ...params }: NearestRecordsParams,
): Promise<NearestRecord[]> {
	const { data } = await instanceClient.post<unknown>('/', buildNearestRecordsRequest(params), {
		// Someone is waiting on this answer and can search again, so a gateway error isn't replayed.
		skipGatewayRetry: true,
	});
	if (!Array.isArray(data)) {
		throw new Error('Harper answered the search with something other than a list of records.');
	}
	throwIfStreamFailed(data);
	return data.filter((hit): hit is NearestRecord => typeof hit === 'object' && hit !== null && !Array.isArray(hit));
}
