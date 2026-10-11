import { describe, expect, it } from 'vitest';
import { CountQueryResult, summarizeDatabaseCounts } from './summarizeDatabaseCounts';

const pending: CountQueryResult = { isPending: true };
// A failed `describe_table`: settled, with nothing to count (the query is `retry: false`).
const failed: CountQueryResult = { isPending: false };
const counted = (record_count: number): CountQueryResult => ({ isPending: false, data: { record_count } });
const estimated = (record_count: number): CountQueryResult => ({
	isPending: false,
	data: { record_count, estimated_record_range: [record_count - 500, record_count + 500] },
});

describe('summarizeDatabaseCounts', () => {
	it('shows … for the total and each table until the counts arrive', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [pending, pending])).toEqual({
			totalLabel: '…',
			recordLabels: ['…', '…'],
		});
	});

	it('labels each table as its count resolves, and holds the total until every count settles', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [counted(1200), pending])).toEqual({
			totalLabel: '…',
			recordLabels: ['1,200', '…'],
		});
	});

	it('sums the counts once every query settles', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [counted(1200), counted(34)])).toEqual({
			totalLabel: '1,234',
			recordLabels: ['1,200', '34'],
		});
	});

	it('does not hang the total on a count that failed, and sums the ones that resolved', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs', 'eels'], [counted(1200), failed, counted(34)])).toEqual({
			totalLabel: '1,234',
			recordLabels: ['1,200', '…', '34'],
		});
	});

	it('marks an estimated count, and the total it contributes to, with ~', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [estimated(250_000), counted(34)])).toEqual({
			totalLabel: '~250,034',
			recordLabels: ['~250,000', '34'],
		});
	});

	it('marks the total ~ only once it has settled', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [estimated(250_000), pending]).totalLabel).toBe('…');
	});

	it('shows … for a table whose describe carries no record_count, and leaves it out of the total', () => {
		const uncounted: CountQueryResult = { isPending: false, data: {} };
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [uncounted, counted(34)])).toEqual({
			totalLabel: '34',
			recordLabels: ['…', '34'],
		});
	});

	it('reads 0 records for a database with no tables', () => {
		expect(summarizeDatabaseCounts([], [])).toEqual({ totalLabel: '0', recordLabels: [] });
	});
});
