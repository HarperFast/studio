import { describe, expect, it } from 'vitest';
import { removedAttributeNames, removedRecordAttributes } from './removedRecordAttributes';

const stored = { id: 'abc-123', name: 'Ada Lovelace', city: 'London', nickname: 'Ada' };

describe('removedRecordAttributes', () => {
	it('reports nothing when the edit keeps every attribute', () => {
		expect(removedRecordAttributes([stored], [{ ...stored, city: 'Paris' }], 'id')).toEqual([]);
	});

	it('names the attributes the edit dropped, against the record that dropped them', () => {
		const { nickname: _nickname, city: _city, ...edited } = stored;
		expect(removedRecordAttributes([stored], [edited], 'id')).toEqual([{ index: 0, removed: ['city', 'nickname'] }]);
	});

	// The reported bug: `null` is a value Harper stores, not a removal. Only a missing key is one.
	it('does not treat an attribute set to null as removed', () => {
		expect(removedRecordAttributes([stored], [{ ...stored, nickname: null }], 'id')).toEqual([]);
	});

	// A patch replaces a nested object wholesale, so a nested deletion already works through
	// `update` and must not drag the record through a full replace.
	it('ignores a property deleted inside a nested object', () => {
		const withNested = { id: 'abc-123', address: { city: 'London', postcode: 'NW1' } };
		expect(removedRecordAttributes([withNested], [{ id: 'abc-123', address: { city: 'London' } }], 'id')).toEqual([]);
	});

	// Removing the primary key makes the edit un-matchable: replacing it would write a row the user
	// didn't ask for, so it stays on the `update` path (where Harper skips it).
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
		expect(removedRecordAttributes([stored, second], edited, 'id')).toEqual([{ index: 0, removed: ['rank'] }]);
	});

	// The index is what lets the caller tell a deliberate rewrite from an untouched record in the
	// same payload; a flat list of names would make the two indistinguishable.
	it('reports only the records that dropped something, by payload index', () => {
		const second = { id: 'def-456', name: 'Grace Hopper', rank: 'Rear Admiral' };
		const edited = [{ ...stored, city: 'Paris' }, { id: 'def-456', name: 'Grace Hopper' }];
		expect(removedRecordAttributes([stored, second], edited, 'id')).toEqual([{ index: 1, removed: ['rank'] }]);
	});

	// `in` would report these as still present, since they live on `Object.prototype`, and the
	// removal would silently take the merge path — exactly the bug being fixed.
	it('detects the removal of an attribute named for a prototype member', () => {
		const withPrototypeNames = { id: 'abc-123', constructor: 'x', toString: 'y', valueOf: 'z' };
		expect(removedRecordAttributes([withPrototypeNames], [{ id: 'abc-123' }], 'id')).toEqual([
			{ index: 0, removed: ['constructor', 'toString', 'valueOf'] },
		]);
	});

	it('does not report a prototype-named attribute the edit kept', () => {
		const withPrototypeNames = { id: 'abc-123', toString: 'y' };
		expect(removedRecordAttributes([withPrototypeNames], [{ id: 'abc-123', toString: 'y' }], 'id')).toEqual([]);
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

describe('removedAttributeNames', () => {
	it('flattens and deduplicates names across records', () => {
		expect(removedAttributeNames([{ index: 0, removed: ['city', 'nickname'] }, { index: 1, removed: ['city'] }]))
			.toEqual(['city', 'nickname']);
	});

	it('is empty when nothing was removed', () => {
		expect(removedAttributeNames([])).toEqual([]);
	});
});
