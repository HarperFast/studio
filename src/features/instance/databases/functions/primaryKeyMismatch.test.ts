import { describe, expect, it } from 'vitest';
import { primaryKeyMismatch } from './primaryKeyMismatch';

const stored = { id: 'abc-123', name: 'Ada Lovelace', city: 'London' };

describe('primaryKeyMismatch', () => {
	it('accepts an edit that kept the primary key', () => {
		expect(primaryKeyMismatch([stored], [{ ...stored, city: 'Paris' }], 'id')).toBeUndefined();
	});

	// `update` requires an existing record, so this write does nothing — and the modal reported
	// success, which is the bug class this change set exists to remove.
	it('reports a deleted primary key as lost', () => {
		const { id: _id, ...withoutPrimaryKey } = stored;
		expect(primaryKeyMismatch([stored], [withoutPrimaryKey], 'id')).toEqual({ kind: 'lost', keys: ['abc-123'] });
	});

	it('reports a nulled primary key as lost', () => {
		expect(primaryKeyMismatch([stored], [{ ...stored, id: null }], 'id')).toEqual({
			kind: 'lost',
			keys: ['abc-123'],
		});
	});

	// Reported as lost rather than unknown: the loaded record is what no longer has an edit, and that
	// is the more useful thing to tell the user.
	it('reports a changed primary key', () => {
		expect(primaryKeyMismatch([stored], [{ ...stored, id: 'def-456' }], 'id')).toEqual({
			kind: 'lost',
			keys: ['abc-123'],
		});
	});

	// An added record naming a row the editor never loaded would have `update` patch that row instead.
	it('reports a key that was never loaded as unknown', () => {
		const edited = [stored, { id: 'def-456', name: 'Grace Hopper' }];
		expect(primaryKeyMismatch([stored], edited, 'id')).toEqual({ kind: 'unknown', keys: ['def-456'] });
	});

	// Regression: keyed on the LOADED keys, so one keyless stored row (#1199) can't refuse a whole
	// batch. The earlier rule flagged every edited record lacking a key and blocked this valid edit.
	it('accepts a valid edit alongside a stored record that has no primary-key value', () => {
		const storedRecords = [stored, { name: 'keyless row' }];
		const edited = [{ ...stored, city: 'Paris' }, { name: 'keyless row' }];
		expect(primaryKeyMismatch(storedRecords, edited, 'id')).toBeUndefined();
	});

	it('accepts a batch that keeps every loaded key, in any order', () => {
		const second = { id: 'def-456', name: 'Grace Hopper' };
		const edited = [second, { ...stored, city: 'Paris' }];
		expect(primaryKeyMismatch([stored, second], edited, 'id')).toBeUndefined();
	});

	it('reports the loaded key that went missing from a batch', () => {
		const second = { id: 'def-456', name: 'Grace Hopper' };
		expect(primaryKeyMismatch([stored, second], [stored], 'id')).toEqual({ kind: 'lost', keys: ['def-456'] });
	});

	// `update` skips a record it can't address and `put` can't create one without a key, so a pasted
	// addition would be silently dropped while the modal reported success.
	it('reports a pasted keyless record as an addition', () => {
		const edited = [stored, { name: 'brand new' }];
		expect(primaryKeyMismatch([stored], edited, 'id')).toEqual({ kind: 'keyless', added: 1, dropped: 0 });
	});

	it('counts only the surplus, so a co-loaded keyless row is still allowed', () => {
		const storedRecords = [stored, { name: 'keyless row' }];
		const edited = [{ ...stored, city: 'Paris' }, { name: 'keyless row' }, { name: 'brand new' }];
		expect(primaryKeyMismatch(storedRecords, edited, 'id')).toEqual({ kind: 'keyless', added: 1, dropped: 0 });
	});

	// The mirror of the `lost` rule for keyed records: dropping a record from the JSON doesn't delete
	// it, so a save would report success having left it alone. Enforced in both directions because
	// this rule has been wrong in a new direction on each of the last three review rounds.
	it('reports a dropped keyless record', () => {
		const storedRecords = [stored, { name: 'keyless row' }];
		expect(primaryKeyMismatch(storedRecords, [{ ...stored, city: 'Paris' }], 'id')).toEqual({
			kind: 'keyless',
			added: 0,
			dropped: 1,
		});
	});

	it('accepts a payload whose keyless records match the loaded ones exactly', () => {
		const storedRecords = [stored, { name: 'keyless row' }];
		const edited = [{ ...stored, city: 'Paris' }, { name: 'keyless row', extra: 1 }];
		expect(primaryKeyMismatch(storedRecords, edited, 'id')).toBeUndefined();
	});

	it('says nothing when the table has no primary key', () => {
		expect(primaryKeyMismatch([stored], [{ name: 'Ada' }], '')).toBeUndefined();
	});

	// #1199: nothing to compare against, and the parent already renders such a row read-only.
	it('says nothing when no stored record has a primary-key value', () => {
		expect(primaryKeyMismatch([{ name: 'Ada' }], [{ name: 'Ada Lovelace' }], 'id')).toBeUndefined();
	});

	it('says nothing when the record has not loaded', () => {
		expect(primaryKeyMismatch(undefined, [{ id: 'abc-123' }], 'id')).toBeUndefined();
		expect(primaryKeyMismatch([], [{ id: 'abc-123' }], 'id')).toBeUndefined();
	});
});
