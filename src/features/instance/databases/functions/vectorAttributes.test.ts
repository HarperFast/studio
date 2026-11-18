import { InstanceTable } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import {
	isHnswIndexed,
	isVector,
	previewAttributes,
	similarRecordsSeed,
	summarizeNumberArray,
	vectorAttributes,
} from './vectorAttributes';

/** `describe_table` from a real Harper 5.4.1, plus an `@embed` field as 5.1+ describes it. */
const DOC = {
	schema: 'vec',
	name: 'Doc',
	primary_key: 'id',
	attributes: [
		{ attribute: 'id', type: 'ID', is_primary_key: true },
		{ attribute: 'embedding', type: 'array', elements: 'Float', indexed: { type: 'HNSW', distance: 'cosine' } },
		{
			attribute: 'bodyVector',
			type: 'array',
			elements: 'Float',
			indexed: { type: 'HNSW' },
			embed: { source: 'body', model: 'default' },
		},
		{ attribute: 'title', type: 'String' },
		{ attribute: 'category', type: 'String', indexed: {} },
		{ attribute: 'summary', type: 'String', computed: true },
		{ attribute: 'body', type: 'String' },
		{ attribute: 'notes', type: 'String' },
		{ attribute: 'price', type: 'Float' },
	],
} as InstanceTable;

describe('isHnswIndexed', () => {
	it('is true only for an HNSW index', () => {
		expect(isHnswIndexed({ type: 'HNSW', distance: 'euclidean' })).toBe(true);
		// A 4.7 btree index describes as `{}`, and older ones as `true`.
		expect(isHnswIndexed({})).toBe(false);
		expect(isHnswIndexed(true)).toBe(false);
		expect(isHnswIndexed(undefined)).toBe(false);
		expect(isHnswIndexed(null)).toBe(false);
	});
});

describe('vectorAttributes', () => {
	it('lists the HNSW attributes, with their metric (cosine when unnamed) and embed source', () => {
		expect(vectorAttributes(DOC)).toEqual([
			{ attribute: 'embedding', distance: 'cosine', embedSource: undefined },
			{ attribute: 'bodyVector', distance: 'cosine', embedSource: 'body' },
		]);
		expect(vectorAttributes(undefined)).toEqual([]);
	});
});

describe('isVector', () => {
	it('takes a non-empty array of finite numbers only', () => {
		expect(isVector([0.1, -2, 3e-7])).toBe(true);
		expect(isVector([])).toBe(false);
		expect(isVector([1, '2'])).toBe(false);
		expect(isVector([1, Number.NaN])).toBe(false);
		expect(isVector([1, Number.POSITIVE_INFINITY])).toBe(false);
		expect(isVector('1,2')).toBe(false);
	});
});

describe('summarizeNumberArray', () => {
	it('leaves arrays of up to eight numbers, and anything not all numbers, to the JSON renderer', () => {
		expect(summarizeNumberArray([1, 2, 3, 4, 5, 6, 7, 8])).toBeUndefined();
		expect(summarizeNumberArray([1, 2, 3, 4, 5, 6, 7, 8, 'nine'])).toBeUndefined();
		expect(summarizeNumberArray({ length: 20 })).toBeUndefined();
	});

	it('leads with the count, then the first three numbers to four significant digits', () => {
		const embedding = [0.0123456, -0.0456789, 0.0789123, ...Array.from({ length: 765 }, () => 0.5)];
		expect(summarizeNumberArray(embedding)).toBe('768 numbers: [0.01235, -0.04568, 0.07891, …]');
	});

	it('keeps integers whole and very small components readable', () => {
		expect(summarizeNumberArray([101, 102, 103, 104, 105, 106, 107, 108, 109])).toBe(
			'9 numbers: [101, 102, 103, …]',
		);
		expect(summarizeNumberArray([1.234567e-9, 0, -0, 4, 5, 6, 7, 8, 9])).toBe('9 numbers: [1.235e-9, 0, 0, …]');
	});
});

describe('previewAttributes', () => {
	it('puts the embed source first, then other stored String attributes, three at most', () => {
		const [, bodyVector] = vectorAttributes(DOC);
		expect(previewAttributes(DOC, 'id', bodyVector)).toEqual(['body', 'title', 'category']);
	});

	it('leaves out computed attributes, the key, and non-String attributes', () => {
		const [embedding] = vectorAttributes(DOC);
		expect(previewAttributes(DOC, 'id', embedding)).toEqual(['title', 'category', 'body']);
	});
});

describe('similarRecordsSeed', () => {
	const vectors = vectorAttributes(DOC);

	it('collects each vector the one loaded record has, keyed by attribute', () => {
		const seed = similarRecordsSeed([{ id: 'a', embedding: [1, 0], bodyVector: 'pending' }], 'id', vectors);
		expect(seed?.key).toBe('a');
		expect([...seed!.vectors]).toEqual([['embedding', [1, 0]]]);
	});

	it('has no seed without exactly one record, a key, or a vector', () => {
		expect(similarRecordsSeed(undefined, 'id', vectors)).toBeUndefined();
		expect(similarRecordsSeed([{ id: 'a', embedding: [1] }, { id: 'b', embedding: [1] }], 'id', vectors))
			.toBeUndefined();
		expect(similarRecordsSeed([{ embedding: [1] }], 'id', vectors)).toBeUndefined();
		expect(similarRecordsSeed([{ id: null, embedding: [1] }], 'id', vectors)).toBeUndefined();
		expect(similarRecordsSeed([{ id: 'a', embedding: [] }], 'id', vectors)).toBeUndefined();
		expect(similarRecordsSeed([{ id: 'a', embedding: [1] }], 'id', [])).toBeUndefined();
	});
});
