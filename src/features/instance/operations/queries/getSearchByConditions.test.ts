import {
	parseComparator,
	translateBooleanValue,
	translateColumnFilterToSearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/features/instance/operations/queries/getSearchByConditions';
import type { InstanceAttribute } from '@/lib/api.patch';
import { describe, expect, it } from 'vitest';

function attr(type?: InstanceAttribute['type']): InstanceAttribute {
	return { attribute: 'col', type };
}

describe('parseComparator', () => {
	it('understand greater than equal', () => {
		expect(parseComparator('>= 10')).toEqual({
			comparator: 'greater_than_equal',
			value: '10',
		});
		expect(parseComparator('gte 10')).toEqual({
			comparator: 'greater_than_equal',
			value: '10',
		});
		expect(parseComparator('gte=10')).toEqual({
			comparator: 'greater_than_equal',
			value: '10',
		});
	});

	it('supports dates', () => {
		expect(parseComparator('>= 2025-10-01')).toEqual({
			comparator: 'greater_than_equal',
			value: '2025-10-01',
		});
	});

	it('falls back to equals with pure numbers', () => {
		expect(parseComparator('2025')).toEqual({
			comparator: 'equals',
			value: '2025',
		});
	});

	it('can compare strings', () => {
		expect(parseComparator('!= foo')).toEqual({
			comparator: 'ne',
			value: 'foo',
		});
		expect(parseComparator('=== foo')).toEqual({
			comparator: 'equals',
			value: 'foo',
		});
		expect(parseComparator('foo*')).toEqual({
			comparator: 'starts_with',
			value: 'foo',
		});
	});

	it('can compare booleans', () => {
		expect(parseComparator('!= bet')).toEqual({
			comparator: 'ne',
			value: 'bet',
		});
		expect(parseComparator('=== ok')).toEqual({
			comparator: 'equals',
			value: 'ok',
		});
		expect(parseComparator('!== nope')).toEqual({
			comparator: 'not_equal',
			value: 'nope',
		});
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
			translateColumnFilterToSearchConditions('age', '> 1 & < 10', attr('Int')),
		).toEqual([
			{
				search_attribute: 'age',
				search_type: 'greater_than',
				search_value: 1,
			},
			{
				search_attribute: 'age',
				search_type: 'less_than',
				search_value: 10,
			},
		]);

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

		expect(() =>
			translateColumnFilterToSearchCondition('score', '<= pi', attr('Float')),
		).toThrowError();

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

		expect(
			translateColumnFilterToSearchCondition('active', '=== bet', attr('Boolean')),
		).toEqual({
			search_attribute: 'active',
			search_type: 'equals',
			search_value: true,
		});
	});

	it('allows date comparisons', () => {
		expect(
			translateColumnFilterToSearchCondition('active', '>= 2025-01-10', attr('Date')),
		).toEqual({
			search_attribute: 'active',
			search_type: 'greater_than_equal',
			search_value: '2025-01-10T00:00:00.000Z',
		});

		expect(
			translateColumnFilterToSearchCondition('active', '!= 2025-01-10', attr('Date')),
		).toEqual({
			search_attribute: 'active',
			search_type: 'ne',
			search_value: '2025-01-10T00:00:00.000Z',
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
