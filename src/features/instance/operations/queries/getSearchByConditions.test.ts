import {
	parseNumericalComparator,
	translateBooleanValue,
	translateColumnFilterToSearchCondition,
	translateStringSearchType,
	translateStringSearchValue,
} from '@/features/instance/operations/queries/getSearchByConditions';
import type { InstanceAttribute } from '@/lib/api.patch';
import { describe, expect, it } from 'vitest';

function attr(type?: InstanceAttribute['type']): InstanceAttribute {
	return { attribute: 'col', type };
}

describe('translateStringSearchType', () => {
	it('returns starts_with when only start anchor is present', () => {
		expect(translateStringSearchType(true, attr('String'))).toBe('starts_with');
	});

	it('returns equals for ID type when no anchors', () => {
		expect(translateStringSearchType(false, attr('ID'))).toBe('equals');
	});

	it('defaults to equals when no anchors and non-ID', () => {
		expect(translateStringSearchType(false, attr('String'))).toBe('equals');
		expect(translateStringSearchType(false, attr('Date'))).toBe('equals');
	});
});

describe('parseNumericalComparator', () => {
	it('understand greater than equal', () => {
		const myExpectations = {
			comparator: 'greater_than_equal',
			rawNumber: '10',
		};
		expect(parseNumericalComparator('>= 10')).toEqual(myExpectations);
		expect(parseNumericalComparator('gte 10')).toEqual(myExpectations);
		expect(parseNumericalComparator('gte=10')).toEqual(myExpectations);
	});

	it('supports dates', () => {
		const myExpectations = {
			comparator: 'greater_than_equal',
			rawNumber: '2025-10-01',
		};
		expect(parseNumericalComparator('>= 2025-10-01')).toEqual(myExpectations);
	});

	it('throws errors with unknown operators', () => {
		expect(() => parseNumericalComparator('add 2')).toThrowError(
			'add is not a known operator; please use <, <=, >, >=, ==, or !=',
		);
	});

	it('falls back to equals with pure numbers', () => {
		const myExpectations = {
			comparator: 'equals',
			rawNumber: '2025',
		};
		expect(parseNumericalComparator('2025')).toEqual(myExpectations);
	});
});

describe('translateStringSearchValue', () => {
	it('strips start anchor', () => {
		expect(translateStringSearchValue(true, 'foo*')).toBe('foo');
	});
	it('returns as-is with no anchors', () => {
		expect(translateStringSearchValue(false, 'foo')).toBe('foo');
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
			translateColumnFilterToSearchCondition('name', 'foo', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'equals',
			search_value: 'foo',
		});

		expect(
			translateColumnFilterToSearchCondition('name', 'bar*', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'starts_with',
			search_value: 'bar',
		});

		expect(
			translateColumnFilterToSearchCondition('name', 'baz', attr('String')),
		).toEqual({
			search_attribute: 'name',
			search_type: 'equals',
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
