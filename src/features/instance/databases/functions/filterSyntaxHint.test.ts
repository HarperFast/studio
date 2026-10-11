import { parseComparator } from '@/integrations/api/instance/database/getSearchByConditions';
import { describe, expect, it } from 'vitest';
import { filterSyntaxHint } from './filterSyntaxHint';

describe('filterSyntaxHint', () => {
	it('shows the wildcards on a text column, and which of them scan', () => {
		const hint = filterSyntaxHint('String', false);
		expect(hint).toContain('Jo* starts with');
		expect(hint).toContain('*hn ends with');
		expect(hint).toContain('*oh* contains');
		expect(hint).toContain('Ends with, contains and != read every record');
	});

	it('shows comparisons on numeric and date columns, without wildcards', () => {
		for (const type of ['Int', 'Float', 'Long', 'BigInt', 'Date']) {
			const hint = filterSyntaxHint(type, false);
			expect(hint).toContain('>');
			expect(hint).not.toContain('*');
		}
	});

	it('says an unindexed column’s filter asks first', () => {
		expect(filterSyntaxHint('String', true)).toContain('Not indexed');
		expect(filterSyntaxHint('Int', true)).toContain('Not indexed');
	});

	// The hint is only as good as the parser agreeing with it.
	it('teaches only what parseComparator reads', () => {
		expect(parseComparator('Jo*').comparator).toBe('starts_with');
		expect(parseComparator('*hn').comparator).toBe('ends_with');
		expect(parseComparator('*oh*').comparator).toBe('contains');
		expect(parseComparator('== Jo*')).toEqual({ comparator: 'eq', value: 'Jo*' });
		expect(parseComparator('!= Jo').comparator).toBe('ne');
		expect(parseComparator('>=5').comparator).toBe('greater_than_equal');
		expect(parseComparator('<=2026-12-31').comparator).toBe('less_than_equal');
		expect(parseComparator('!= 5').comparator).toBe('ne');
	});
});
