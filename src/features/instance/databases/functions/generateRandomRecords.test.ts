import { InstanceAttribute } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { generateRandomRecords, randomizableAttributes } from './generateRandomRecords';

const attributes: InstanceAttribute[] = [
	{ attribute: 'id', is_primary_key: true, type: 'ID' },
	{ attribute: '__createdtime__', type: 'Date' },
	{ attribute: '__updatedtime__', type: 'Date' },
	{ attribute: 'title', type: 'String' },
	{ attribute: 'pages', type: 'Int' },
	{ attribute: 'rating', type: 'Float' },
	{ attribute: 'in_print', type: 'Boolean' },
	{ attribute: 'published_on', type: 'Date' },
	{ attribute: 'cover', type: 'Blob' },
];

describe('randomizableAttributes', () => {
	it('skips the primary key, system timestamps, and binary columns', () => {
		expect(randomizableAttributes(attributes).map((a) => a.attribute)).toEqual([
			'title',
			'pages',
			'rating',
			'in_print',
			'published_on',
		]);
	});

	it('handles undefined', () => {
		expect(randomizableAttributes(undefined)).toEqual([]);
	});

	it('fills a plain untyped array, but not one the schema declares a relationship', () => {
		const withTracks: InstanceAttribute[] = [...attributes, { attribute: 'tracks', type: 'array' }];
		expect(randomizableAttributes(withTracks).map((a) => a.attribute)).toContain('tracks');
		expect(
			randomizableAttributes(withTracks, undefined, [
				{ attribute: 'tracks', relatedTableName: 'Tracks', isToMany: true, to: 'albumId' },
			]).map((a) => a.attribute),
		).not.toContain('tracks');
	});
});

describe('generateRandomRecords for array attributes', () => {
	it('fills a typed array with values of its element type, and leaves an untyped one empty', () => {
		const records = generateRandomRecords([
			{ attribute: 'scores', type: 'array', elements: 'Int' },
			{ attribute: 'tracks', type: 'array' },
		], 10);
		for (const record of records) {
			expect(Array.isArray(record.scores)).toBe(true);
			expect((record.scores as unknown[]).length).toBeGreaterThan(0);
			expect((record.scores as unknown[]).every(Number.isInteger)).toBe(true);
			expect(record.tracks).toEqual([]);
		}
	});
});

describe('generateRandomRecords', () => {
	it('generates the requested number of records with type-appropriate values', () => {
		const records = generateRandomRecords(attributes, 20);
		expect(records).toHaveLength(20);
		for (const record of records) {
			expect(record).not.toHaveProperty('id');
			expect(record).not.toHaveProperty('__createdtime__');
			expect(record).not.toHaveProperty('cover');
			expect(typeof record.title).toBe('string');
			expect(Number.isInteger(record.pages)).toBe(true);
			expect(typeof record.rating).toBe('number');
			expect(typeof record.in_print).toBe('boolean');
			expect(() => new Date(record.published_on as string).toISOString()).not.toThrow();
		}
	});

	it('uses name heuristics for untyped (schemaless) columns', () => {
		const untyped: InstanceAttribute[] = [
			{ attribute: 'owner_email' },
			{ attribute: 'age' },
			{ attribute: 'is_active' },
			{ attribute: 'dog_name' },
		];
		for (const record of generateRandomRecords(untyped, 10)) {
			expect(record.owner_email).toMatch(/^[a-z.]+@example\.com$/);
			expect(Number.isInteger(record.age)).toBe(true);
			expect(record.age as number).toBeGreaterThanOrEqual(1);
			expect(record.age as number).toBeLessThanOrEqual(90);
			expect(typeof record.is_active).toBe('boolean');
			expect(typeof record.dog_name).toBe('string');
		}
	});

	it('respects declared numeric types over name heuristics that yield strings', () => {
		const typed: InstanceAttribute[] = [{ attribute: 'name_code', type: 'Int' }];
		for (const record of generateRandomRecords(typed, 5)) {
			expect(Number.isInteger(record.name_code)).toBe(true);
		}
	});
});
