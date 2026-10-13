import { describe, expect, it } from 'vitest';
import { extraRecordAttributes, MAX_EXTRA_COLUMNS, sameExtraRecordAttributes } from './extraRecordAttributes';

const known = new Set(['id', 'name']);

describe('extraRecordAttributes', () => {
	it('finds the properties no column covers, most common first', () => {
		const rows = [
			{ id: 1, name: 'a', size: 3 },
			{ id: 2, name: 'b', color: 'red' },
			{ id: 3, name: 'c', color: 'blue', size: null, shiny: true },
			{ id: 4, color: 'green' },
		];
		expect(extraRecordAttributes(rows, known).map(({ attribute }) => attribute)).toEqual([
			'color',
			'size',
			'shiny',
		]);
	});

	it('reads the type off the first value that is not null', () => {
		const rows = [
			{ id: 1, count: null, ratio: 0.5, flag: false, tags: ['x'] },
			{ id: 2, count: 4, label: 'x' },
		];
		expect(extraRecordAttributes(rows, known)).toEqual([
			{ attribute: 'count', type: 'Int' },
			{ attribute: 'ratio', type: 'Float' },
			{ attribute: 'flag', type: 'Boolean' },
			{ attribute: 'tags', type: 'Any' },
			{ attribute: 'label', type: 'String' },
		]);
	});

	it('finds nothing when every property has a column, or there are no rows', () => {
		expect(extraRecordAttributes([{ id: 1, name: 'a' }], known)).toEqual([]);
		expect(extraRecordAttributes([], known)).toEqual([]);
	});

	it('stops at MAX_EXTRA_COLUMNS, dropping the rarest', () => {
		const wide = Object.fromEntries(Array.from({ length: MAX_EXTRA_COLUMNS + 5 }, (_, index) => [`p${index}`, 1]));
		const rows = [wide, { id: 2, p29: 1, p28: 1 }];
		const extras = extraRecordAttributes(rows, known).map(({ attribute }) => attribute);
		expect(extras).toHaveLength(MAX_EXTRA_COLUMNS);
		expect(extras.slice(0, 2)).toEqual(['p28', 'p29']);
		expect(extras).not.toContain('p27');
	});
});

describe('sameExtraRecordAttributes', () => {
	it('compares names and types in order', () => {
		const a = [{ attribute: 'color', type: 'String' }];
		expect(sameExtraRecordAttributes(a, [{ attribute: 'color', type: 'String' }])).toBe(true);
		expect(sameExtraRecordAttributes(a, [{ attribute: 'color', type: 'Int' }])).toBe(false);
		expect(sameExtraRecordAttributes(a, [])).toBe(false);
	});
});
