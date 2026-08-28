import { describe, expect, it } from 'vitest';
import { removedRecordAttributes } from './removedRecordAttributes';

const stored = { id: 'abc-123', name: 'Ada Lovelace', city: 'London', nickname: 'Ada' };

describe('removedRecordAttributes', () => {
	it('reports nothing when the edit keeps every attribute', () => {
		expect(removedRecordAttributes([stored], [{ ...stored, city: 'Paris' }], 'id')).toEqual([]);
	});

	it('names the attributes the edit dropped', () => {
		const { nickname: _nickname, city: _city, ...edited } = stored;
		expect(removedRecordAttributes([stored], [edited], 'id')).toEqual(['city', 'nickname']);
	});

	// The reported bug: `null` is a value Harper stores, not a removal. Only a missing key is one.
	it('does not treat an attribute set to null as removed', () => {
		expect(removedRecordAttributes([stored], [{ ...stored, nickname: null }], 'id')).toEqual([]);
	});

	// A patch replaces a nested object wholesale, so a nested deletion already works through
	// `update` and must not drag the record through a delete/insert rewrite.
	it('ignores a property deleted inside a nested object', () => {
		const withNested = { id: 'abc-123', address: { city: 'London', postcode: 'NW1' } };
		expect(removedRecordAttributes([withNested], [{ id: 'abc-123', address: { city: 'London' } }], 'id')).toEqual([]);
	});

	// Removing the primary key makes the edit un-matchable: rewriting it would delete a row the
	// user didn't ask to delete, so it stays on the `update` path (where Harper skips it).
	it('reports nothing when the edit removed the primary key', () => {
		const { id: _id, ...withoutPrimaryKey } = stored;
		expect(removedRecordAttributes([stored], [withoutPrimaryKey], 'id')).toEqual([]);
	});

	it('reports nothing when the edit changed the primary key to a different record', () => {
		expect(removedRecordAttributes([stored], [{ id: 'other', name: 'Ada Lovelace' }], 'id')).toEqual([]);
	});

	it('pairs records by primary key rather than by position', () => {
		const second = { id: 'def-456', name: 'Grace Hopper', rank: 'Rear Admiral' };
		const edited = [{ id: 'def-456', name: 'Grace Hopper' }, stored];
		expect(removedRecordAttributes([stored, second], edited, 'id')).toEqual(['rank']);
	});

	it('reports nothing for a record with no primary-key value, which cannot be addressed', () => {
		expect(removedRecordAttributes([{ name: 'Ada' }], [{}], 'id')).toEqual([]);
	});

	it('reports nothing when the table has no primary key at all', () => {
		expect(removedRecordAttributes([stored], [{ id: 'abc-123' }], '')).toEqual([]);
	});

	it('tolerates a record that has not loaded yet', () => {
		expect(removedRecordAttributes(undefined, [{ id: 'abc-123' }], 'id')).toEqual([]);
	});
});
