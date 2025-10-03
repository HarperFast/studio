import {
	translateBooleanValue,
	translateColumnFilterToSearchCondition,
	translateNumberComparator,
	translateStringSearchType,
	translateStringSearchValue,
} from '@/features/instance/operations/queries/getSearchByConditions';
import type { InstanceAttribute } from '@/lib/api.patch';
import { describe, expect, it } from 'vitest';

function attr(type?: InstanceAttribute['type']): InstanceAttribute {
	return { attribute: 'col', type };
}

describe('translateStringSearchType', () => {
	it('returns equals when both anchors are present', () => {
		expect(translateStringSearchType(true, true, attr('String'))).toBe('equals');
	});

	it('returns starts_with when only start anchor is present', () => {
		expect(translateStringSearchType(true, false, attr('String'))).toBe('starts_with');
	});

	it('returns ends_with when only end anchor is present', () => {
		expect(translateStringSearchType(false, true, attr('String'))).toBe('ends_with');
	});

	it('returns equals for ID type when no anchors', () => {
		expect(translateStringSearchType(false, false, attr('ID'))).toBe('equals');
	});

	it('defaults to starts_with when no anchors and non-ID', () => {
		expect(translateStringSearchType(false, false, attr('String'))).toBe('starts_with');
		expect(translateStringSearchType(false, false, attr('Date'))).toBe('starts_with');
	});
});

describe('translateStringSearchValue', () => {
	it('strips both anchors', () => {
		expect(translateStringSearchValue(true, true, '^foo$')).toBe('foo');
	});
	it('strips start anchor only', () => {
		expect(translateStringSearchValue(true, false, '^foo')).toBe('foo');
	});
	it('strips end anchor only', () => {
		expect(translateStringSearchValue(false, true, 'foo$')).toBe('foo');
	});
	it('returns as-is with no anchors', () => {
		expect(translateStringSearchValue(false, false, 'foo')).toBe('foo');
	});
});

describe('translateNumberComparator', () => {
	it('maps > to greater_than', () => {
		expect(translateNumberComparator('>')).toBe('greater_than');
	});
	it('maps >= to greater_than_equal', () => {
		expect(translateNumberComparator('>=')).toBe('greater_than_equal');
	});
	it('maps < to less_than', () => {
		expect(translateNumberComparator('<')).toBe('less_than');
	});
	it('maps <= to less_than_equal', () => {
		expect(translateNumberComparator('<=')).toBe('less_than_equal');
	});
	it('defaults to equals for = and undefined', () => {
		expect(translateNumberComparator('=')).toBe('equals');
		expect(translateNumberComparator(undefined)).toBe('equals');
	});
});

describe('translateBooleanValue', () => {
	it('recognizes truthy variants (case-insensitive)', () => {
		const truthy = ['true', 'Yes', 'OK', 'Yup', '1', 'Si', 'bet', 'TrU'];
		for (const v of truthy) {
			expect(translateBooleanValue(v)).toBe(true);
		}
	});
	it('returns false for non-matching values', () => {
		const falsy = ['false', 'no', '0', 'nah', 'maybe', 'foo', '', 'truth'];
		for (const v of falsy) {
			expect(translateBooleanValue(v)).toBe(false);
		}
	});
});

describe('translateColumnFilterToSearchCondition', () => {
	it('handles String attribute with anchors', () => {
		expect(
			translateColumnFilterToSearchCondition('name', '^foo$', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'equals',
			search_value: 'foo',
		});

		expect(
			translateColumnFilterToSearchCondition('name', 'bar$', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'ends_with',
			search_value: 'bar',
		});

		expect(
			translateColumnFilterToSearchCondition('name', 'baz', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'starts_with',
			search_value: 'baz',
		});
	});

	it('forces equals for ID when no anchors', () => {
		expect(
			translateColumnFilterToSearchCondition('id', 'abc123', attr('ID')),
		).toEqual({
			search_attribute: 'id',
			search_type: 'equals',
			search_value: 'abc123',
		});
	});

	it('parses numeric types and comparators', () => {
		expect(
			translateColumnFilterToSearchCondition('age', '>=10', attr('Int')),
		).toEqual({
			search_attribute: 'age',
			search_type: 'greater_than_equal',
			search_value: 10,
		});

		expect(
			translateColumnFilterToSearchCondition('score', '<=3.14', attr('Float')),
		).toEqual({
			search_attribute: 'score',
			search_type: 'less_than_equal',
			search_value: 3.14,
		});

		// No comparator defaults to equals
		expect(
			translateColumnFilterToSearchCondition('count', '42', attr('Int')),
		).toEqual({
			search_attribute: 'count',
			search_type: 'equals',
			search_value: 42,
		});
	});

	it('parses booleans with accepted truthy values', () => {
		expect(
			translateColumnFilterToSearchCondition('active', 'Yes', attr('Boolean')),
		).toEqual({
			search_attribute: 'active',
			search_type: 'equals',
			search_value: true,
		});

		expect(
			translateColumnFilterToSearchCondition('active', 'no', attr('Boolean')),
		).toEqual({
			search_attribute: 'active',
			search_type: 'equals',
			search_value: false,
		});
	});

	it('falls back to equals for unknown or undefined attribute types', () => {
		expect(
			translateColumnFilterToSearchCondition('misc', 'value', attr('Bytes')),
		).toEqual({
			search_attribute: 'misc',
			search_type: 'equals',
			search_value: 'value',
		});

		expect(
			translateColumnFilterToSearchCondition('misc', 'value', undefined),
		).toEqual({
			search_attribute: 'misc',
			search_type: 'equals',
			search_value: 'value',
		});
	});
});
