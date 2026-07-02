import { describe, expect, it } from 'vitest';
import { parseJsonRecords } from './parseJsonRecords';

describe('parseJsonRecords', () => {
	it('parses an array of objects', () => {
		expect(parseJsonRecords('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
	});

	it('wraps a single object into a one-record array', () => {
		expect(parseJsonRecords('{"id":1,"name":"Penny"}')).toEqual([{ id: 1, name: 'Penny' }]);
	});

	it('rejects invalid JSON', () => {
		expect(() => parseJsonRecords('{oops')).toThrow('not valid JSON');
	});

	it('rejects empty arrays', () => {
		expect(() => parseJsonRecords('[]')).toThrow('no records');
	});

	it('rejects arrays of non-objects', () => {
		expect(() => parseJsonRecords('[1,2,3]')).toThrow('array of objects');
		expect(() => parseJsonRecords('[[1],[2]]')).toThrow('array of objects');
		expect(() => parseJsonRecords('[{"id":1},null]')).toThrow('array of objects');
	});

	it('rejects JSON primitives', () => {
		expect(() => parseJsonRecords('"hello"')).toThrow('array of objects');
		expect(() => parseJsonRecords('42')).toThrow('array of objects');
	});
});
