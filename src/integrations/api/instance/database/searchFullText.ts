/**
 * A full-text search through `search_by_conditions` (Harper 5.3+), for the database browser's search
 * tester. The condition names the index (the `FullText` field) and a full-text comparator; selecting
 * `$score` and `$highlights` alongside the record adds the relevance score and the matched spans.
 *
 * Harper always returns full-text results in descending `$score` order and refuses any other sort,
 * so none is sent. See harper `resources/FULL_TEXT.md` at v5.3.6.
 */
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { FullTextIndexDescription } from '@/integrations/api/api.patch';

export type FullTextComparator =
	| 'matches'
	| 'matches_all'
	| 'matches_phrase'
	| 'matches_prefix'
	| 'matches_fuzzy'
	| 'matches_fuzzy_prefix';

export interface FullTextQueryMode {
	comparator: FullTextComparator;
	/** The name `describe_table` lists in an index's `query_modes`. */
	mode: string;
	label: string;
	description: string;
}

/** Harper's comparators and the `query_modes` names that say an index answers them (`fullTextQueryProtocol.ts`). */
export const FULL_TEXT_QUERY_MODES: FullTextQueryMode[] = [
	{ comparator: 'matches', mode: 'any', label: 'Any term', description: 'Records with any of the terms.' },
	{ comparator: 'matches_all', mode: 'all', label: 'All terms', description: 'Records with every term.' },
	{
		comparator: 'matches_phrase',
		mode: 'phrase',
		label: 'Phrase',
		description: 'The terms together, in this order.',
	},
	{
		comparator: 'matches_prefix',
		mode: 'prefix',
		label: 'Prefix',
		description: 'Terms that start with what you typed, for search-as-you-type.',
	},
	{
		comparator: 'matches_fuzzy',
		mode: 'fuzzy',
		label: 'Fuzzy',
		description: 'Terms spelled close to these, to forgive typos.',
	},
	{
		comparator: 'matches_fuzzy_prefix',
		mode: 'fuzzy-prefix',
		label: 'Fuzzy prefix',
		description: 'Terms that start with something spelled close to this.',
	},
];

/** The modes `index` answers, in {@link FULL_TEXT_QUERY_MODES} order. */
export function supportedQueryModes(index: FullTextIndexDescription): FullTextQueryMode[] {
	return FULL_TEXT_QUERY_MODES.filter(mode => index.query_modes.includes(mode.mode));
}

/**
 * The most a search may wait for the index to catch up with earlier writes; Harper refuses more.
 * It only waits as long as it needs to.
 */
const MAX_WAIT_FOR_INDEX_MILLISECONDS = 30_000;

export interface FullTextSearchParams extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	index: FullTextIndexDescription;
	comparator: FullTextComparator;
	query: string;
	/** A subset of the index's sources to search; every source `describe_table` listed when empty. */
	fields: string[];
	/**
	 * Wait (up to {@link MAX_WAIT_FOR_INDEX_MILLISECONDS}) until the index covers every write committed
	 * before the search. Otherwise Harper answers from an index up to 3 seconds behind.
	 */
	waitForRecentWrites: boolean;
	limit: number;
}

/** `$highlights[field][n]`: one matched value of a source field (`valueIndex` picks it out of a `[String]`). */
export interface FullTextValueHighlight {
	valueIndex: number;
	spans: FullTextSpan[];
	fragments?: Array<{ text: string; start: number; spans: FullTextSpan[] }>;
}

export interface FullTextSpan {
	start: number;
	end: number;
}

export type FullTextHit = Record<string, unknown> & {
	$score?: number;
	$highlights?: Record<string, FullTextValueHighlight[]>;
};

export function buildFullTextSearchRequest(
	{ databaseName, tableName, index, comparator, query, fields, waitForRecentWrites, limit }: Omit<
		FullTextSearchParams,
		'instanceClient'
	>,
) {
	// Asking an index without highlighting for `$highlights` is refused outright.
	const highlights = index.highlighting !== false;
	return {
		operation: 'search_by_conditions',
		database: databaseName,
		table: tableName,
		get_attributes: ['*', '$score', ...(highlights ? ['$highlights'] : [])],
		conditions: [{
			attribute: index.name,
			comparator,
			value: query,
			// Always named, never left to the default of every source: describe lists only the sources this
			// role can read, and the default would also search, and rank on, the ones it left out. Naming them
			// all gives the same hits and scores as the default when nothing was left out (Harper 5.3.6).
			fields: fields.length > 0 ? fields : index.fields.map(source => source.name),
			// `maxIndexLagMilliseconds: 0` makes the search need full coverage, and the wait is how long it may
			// take to get there; together, writes committed before the search are in its results.
			...(waitForRecentWrites
				? { maxIndexLagMilliseconds: 0, waitForIndexMilliseconds: MAX_WAIT_FOR_INDEX_MILLISECONDS }
				: null),
		}],
		limit,
	};
}

/**
 * Harper failing a search after its results began to stream. The response is already a 200 by then, so
 * Harper ends the array with `{ error }` instead (harper `server/serverHelpers/JSONStream.ts`, v5.3.6):
 * the hits before it are a partial answer, and the failure is Harper's own words.
 */
export class FullTextSearchStreamError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FullTextSearchStreamError';
	}
}

/** The trailing `{ error }` Harper streams in place of further results. A hit always carries `$score`. */
function streamedError(hit: FullTextHit | undefined): string | undefined {
	if (!hit || typeof hit !== 'object' || Object.keys(hit).length !== 1) {
		return undefined;
	}
	const { error } = hit as { error?: unknown };
	return typeof error === 'string' ? error : undefined;
}

export async function searchFullText({ instanceClient, ...params }: FullTextSearchParams): Promise<FullTextHit[]> {
	const { data } = await instanceClient.post<FullTextHit[]>('/', buildFullTextSearchRequest(params), {
		// Harper answers 503 while an index rebuilds (`IndexRebuildingError`), and the gateway retry would
		// replay that for 35 seconds before the tester could show it. Someone is waiting on this answer and
		// can search again, so it is sent once. (The client's 60-second timeout covers the longest wait.)
		skipGatewayRetry: true,
	});
	const failure = Array.isArray(data) ? streamedError(data.at(-1)) : undefined;
	if (failure !== undefined) {
		throw new FullTextSearchStreamError(failure);
	}
	return data;
}
