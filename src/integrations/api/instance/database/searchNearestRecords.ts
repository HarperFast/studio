/**
 * The records whose vector is nearest a query, nearest first, through `search_by_value` on the primary
 * key with `'*'` and an HNSW `sort`. `search_by_conditions` can't carry a `target`: it needs a condition,
 * and drops a condition's `target` (harper `dataLayer/harperBridge/ResourceBridge.ts`, the same in 4.7.42
 * and 5.4.1).
 *
 * The query is a stored vector (`target`) or text. Harper doesn't check a target's length: it pads the
 * shorter vector with zeros and ranks by that (`resources/indexes/vector.ts`), so a target is always a
 * vector read from the table itself. Text Harper embeds with the attribute's own `@embed` model, as a
 * query (HarperFast/harper#4498).
 */
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { throwIfStreamFailed } from '@/integrations/api/instance/database/searchStreamError';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/** The first release whose vector sort takes `text` (HarperFast/harper#4498). */
const SEARCH_BY_TEXT_MIN_VERSION = '5.4.2';

export function supportsSearchByText(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(SEARCH_BY_TEXT_MIN_VERSION, version);
}

/**
 * Whether to offer a search by text, given the version once it has been read. Not while it is being read,
 * and not on a Harper known to predate it. A version Harper won't tell still offers it: an older Harper
 * refuses the sort with a 400 that the dialog shows.
 */
export function offersSearchByText(version: string | undefined, versionSettled: boolean): boolean {
	return versionSettled && (version === undefined || supportsSearchByText(version));
}

export type NearestRecordsQuery = { target: number[]; text?: never } | { text: string; target?: never };

export interface NearestRecordsParams extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	primaryKey: string;
	attribute: string;
	query: NearestRecordsQuery;
	/** Read besides the key and `$distance`; never `'*'`, which would bring every vector back. */
	previewAttributes: string[];
	limit: number;
}

export type NearestRecord = Record<string, unknown> & { $distance?: unknown };

export function buildNearestRecordsRequest(
	{ databaseName, tableName, primaryKey, attribute, query, previewAttributes, limit }: Omit<
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
		// Harper refuses a sort with both, so exactly one is sent.
		sort: query.text !== undefined ? { attribute, text: query.text } : { attribute, target: query.target },
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
