import type { InstanceAttribute } from '@/integrations/api/api.patch';
import {
	parseComparator,
	translateColumnFilterToSearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/integrations/api/instance/database/getSearchByConditions';
import { translateKnownBooleanTypedValue } from '@/lib/boolean/translateKnownBooleanTypedValue';
import { describe, expect, it } from 'vitest';

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

	it('requires a separator after alphabetic operators to avoid ambiguity', () => {
		// "LT1" looks like it could be the literal value "LT1" — a letter operator
		// only counts as a comparator if it's followed by a space or underscore.
		expect(parseComparator('LT1')).toEqual({
			comparator: 'equals',
			value: 'LT1',
		});
		expect(parseComparator('gt5')).toEqual({
			comparator: 'equals',
			value: 'gt5',
		});
		expect(parseComparator('greaterthan10')).toEqual({
			comparator: 'equals',
			value: 'greaterthan10',
		});

		// With a space it's unambiguous, so the operator parses.
		expect(parseComparator('lt 1')).toEqual({
			comparator: 'less_than',
			value: '1',
		});
		expect(parseComparator('LT 1')).toEqual({
			comparator: 'less_than',
			value: '1',
		});
		expect(parseComparator('gt 5')).toEqual({
			comparator: 'greater_than',
			value: '5',
		});
		expect(parseComparator('lt_1')).toEqual({
			comparator: 'less_than',
			value: '1',
		});
	});

	it('does not require a separator for symbolic operators', () => {
		// Symbols like < and >= are unambiguous, so no space needed.
		expect(parseComparator('<1')).toEqual({
			comparator: 'less_than',
			value: '1',
		});
		expect(parseComparator('< 1')).toEqual({
			comparator: 'less_than',
			value: '1',
		});
		expect(parseComparator('>=10')).toEqual({
			comparator: 'greater_than_equal',
			value: '10',
		});
		expect(parseComparator('>1')).toEqual({
			comparator: 'greater_than',
			value: '1',
		});
		expect(parseComparator('<=3.14')).toEqual({
			comparator: 'less_than_equal',
			value: '3.14',
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
			expect(translateKnownBooleanTypedValue(v)).toBe(true);
		}
	});
	it('returns false for non-matching values', () => {
		const falsy = ['false', 'no', '0', 'nah', 'maybe', 'foo', '', 'truth'];
		for (const v of falsy) {
			expect(translateKnownBooleanTypedValue(v)).toBe(false);
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

		expect(() => translateColumnFilterToSearchCondition('score', '<= pi', attr('Float'))).toThrowError();

		// No comparator defaults to equals
		expect(
			translateColumnFilterToSearchCondition('count', '42', attr('Int')),
		).toEqual({
			search_attribute: 'count',
			search_type: 'equals',
			search_value: 42,
		});
	});

	it('strips off redundant names', () => {
		expect(
			translateColumnFilterToSearchConditions('age', 'age > 1 & age < 10', attr('Int')),
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

	function attr(type?: InstanceAttribute['type']): InstanceAttribute {
		return { attribute: 'col', type };
	}
});
