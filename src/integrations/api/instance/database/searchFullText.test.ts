import { FullTextIndexDescription } from '@/integrations/api/api.patch';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	buildFullTextSearchRequest,
	FULL_TEXT_QUERY_MODES,
	FullTextSearchStreamError,
	searchFullText,
	supportedQueryModes,
} from './searchFullText';

/** `describe_table`'s `full_text_indexes[0]` from a real Harper 5.3.6, for the docs' Product table. */
const INDEX: FullTextIndexDescription = {
	name: 'catalogSearch',
	fields: [
		{ name: 'title', weight: 3, highlight: true },
		{ name: 'description', weight: 1, highlight: true },
		{ name: 'tags', weight: 1 },
	],
	analyzer: 'english@2',
	stop_words: true,
	positions: true,
	surface_terms: true,
	synonyms: [],
	highlighting: { maxFragments: 2, fragmentLength: 60 },
	query_modes: ['any', 'all', 'fuzzy', 'phrase', 'prefix', 'fuzzy-prefix'],
	readiness: { state: 'ready', owner_epoch: '2', rebuild_attempts: 0 },
};

const BASE = {
	databaseName: 'data',
	tableName: 'Product',
	index: INDEX,
	comparator: 'matches' as const,
	query: 'trail running',
	fields: [],
	waitForRecentWrites: false,
	limit: 20,
};

describe('buildFullTextSearchRequest', () => {
	it('searches the index by name and selects the record, its score and its highlights', () => {
		expect(buildFullTextSearchRequest(BASE)).toEqual({
			operation: 'search_by_conditions',
			database: 'data',
			table: 'Product',
			get_attributes: ['*', '$score', '$highlights'],
			conditions: [{
				attribute: 'catalogSearch',
				comparator: 'matches',
				value: 'trail running',
				fields: ['title', 'description', 'tags'],
			}],
			limit: 20,
		});
	});

	it('sends no sort: Harper refuses any order but descending score', () => {
		expect(buildFullTextSearchRequest(BASE)).not.toHaveProperty('sort');
	});

	it('doesn’t ask an index without highlighting for highlights, which Harper refuses', () => {
		const request = buildFullTextSearchRequest({ ...BASE, index: { ...INDEX, highlighting: false } });
		expect(request.get_attributes).toEqual(['*', '$score']);
	});

	it('narrows to chosen sources and waits for recent writes when asked', () => {
		const [condition] = buildFullTextSearchRequest({
			...BASE,
			comparator: 'matches_phrase',
			fields: ['title'],
			waitForRecentWrites: true,
		}).conditions;
		expect(condition).toEqual({
			attribute: 'catalogSearch',
			comparator: 'matches_phrase',
			value: 'trail running',
			fields: ['title'],
			maxIndexLagMilliseconds: 0,
			waitForIndexMilliseconds: 30_000,
		});
	});
});

describe('supportedQueryModes', () => {
	it('offers every mode an index with positions and surface terms answers', () => {
		expect(supportedQueryModes(INDEX).map(mode => mode.comparator)).toEqual(
			FULL_TEXT_QUERY_MODES.map(mode => mode.comparator),
		);
	});

	it('drops phrase without positions, and the prefix modes without surface terms', () => {
		expect(supportedQueryModes({ ...INDEX, query_modes: ['any', 'all', 'fuzzy'] }).map(mode => mode.comparator))
			.toEqual(['matches', 'matches_all', 'matches_fuzzy']);
	});
});

describe('buildFullTextSearchRequest sources', () => {
	it('names every source describe listed rather than leaving it to the default, which a restricted role can’t see all of', () => {
		// describe leaves out the sources this role can't read; Harper's default would still search them.
		const visibleOnly = { ...INDEX, fields: [{ name: 'title', weight: 3 }] };
		const [condition] = buildFullTextSearchRequest({ ...BASE, index: visibleOnly }).conditions;
		expect(condition.fields).toEqual(['title']);
	});
});

describe('searchFullText when Harper fails partway', () => {
	const post = (data: unknown) => ({ post: vi.fn(async () => ({ data })) }) as unknown as AxiosInstance;
	const params = { ...BASE };

	it('fails the search on the trailing { error } Harper streams once its 200 has begun', async () => {
		const client = post([{ id: 'shoe-1', $score: 4.3 }, { error: "Full-text index 'catalogSearch' is not ready" }]);
		await expect(searchFullText({ ...params, instanceClient: client })).rejects.toThrow(
			new FullTextSearchStreamError("Full-text index 'catalogSearch' is not ready"),
		);
	});

	it('keeps a hit that merely has an attribute named error', async () => {
		const hits = [{ id: 'e1', error: 'disk full', $score: 1.2 }];
		await expect(searchFullText({ ...params, instanceClient: post(hits) })).resolves.toEqual(hits);
	});
});
