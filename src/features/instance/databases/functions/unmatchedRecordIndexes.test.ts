import { describe, expect, it } from 'vitest';
import { unmatchedRecordIndexes } from './unmatchedRecordIndexes';

const stored = { id: 'abc-123', name: 'Ada Lovelace', city: 'London' };

describe('unmatchedRecordIndexes', () => {
	it('matches a record that kept its primary key', () => {
		expect(unmatchedRecordIndexes([stored], [{ ...stored, city: 'Paris' }], 'id')).toEqual([]);
	});

	// `update` requires an existing record, so this write does nothing at all — and the modal used to
	// report success, which is the bug class this change set exists to remove.
	it('flags a record whose primary key was deleted', () => {
		const { id: _id, ...withoutPrimaryKey } = stored;
		expect(unmatchedRecordIndexes([stored], [withoutPrimaryKey], 'id')).toEqual([0]);
	});

	it('flags a record whose primary key was changed', () => {
		expect(unmatchedRecordIndexes([stored], [{ ...stored, id: 'def-456' }], 'id')).toEqual([0]);
	});

	it('flags a primary key nulled out rather than removed', () => {
		expect(unmatchedRecordIndexes([stored], [{ ...stored, id: null }], 'id')).toEqual([0]);
	});

	it('reports every offending index in a batch, and only those', () => {
		const second = { id: 'def-456', name: 'Grace Hopper' };
		const edited = [{ ...stored, id: 'moved' }, second, { name: 'no key' }];
		expect(unmatchedRecordIndexes([stored, second], edited, 'id')).toEqual([0, 2]);
	});

	// A record swapped onto a key the editor DID load is still that loaded record, so it is not a
	// mismatch: the removal/merge routing downstream pairs it correctly.
	it('accepts a key that belongs to another loaded record', () => {
		const second = { id: 'def-456', name: 'Grace Hopper' };
		expect(unmatchedRecordIndexes([stored, second], [{ id: 'def-456', name: 'G' }], 'id')).toEqual([]);
	});

	it('says nothing when the table has no primary key', () => {
		expect(unmatchedRecordIndexes([stored], [{ name: 'Ada' }], '')).toEqual([]);
	});

	// #1199: the stored record has no value for the declared primary key, so there is nothing to
	// compare against. The parent renders that row read-only; calling it a mismatch would mislabel it.
	it('says nothing when the stored record has no primary-key value', () => {
		expect(unmatchedRecordIndexes([{ name: 'Ada' }], [{ name: 'Ada Lovelace' }], 'id')).toEqual([]);
	});

	it('says nothing when the record has not loaded', () => {
		expect(unmatchedRecordIndexes(undefined, [{ id: 'abc-123' }], 'id')).toEqual([]);
		expect(unmatchedRecordIndexes([], [{ id: 'abc-123' }], 'id')).toEqual([]);
	});
});
