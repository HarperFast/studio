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

	it('sums the counts once every query settles, as an exact total with nothing to explain', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [counted(1200), counted(34)])).toEqual({
			totalLabel: '1,234',
			totalDescription: undefined,
			recordLabels: ['1,200', '34'],
		});
	});

	it('does not hang the total on a count that failed, and marks the sum of the rest as a lower bound', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs', 'eels'], [counted(1200), failed, counted(34)])).toEqual({
			totalLabel: '≥1,234',
			totalDescription: 'At least 1,234 records: one or more tables’ counts couldn’t be loaded',
			recordLabels: ['1,200', '…', '34'],
		});
	});

	it('marks an estimated count, and the total it contributes to, with ~', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [estimated(250_000), counted(34)])).toEqual({
			totalLabel: '~250,034',
			totalDescription: 'Approximately 250,034 records (estimated)',
			recordLabels: ['~250,000', '34'],
		});
	});

	it('marks a total that is both missing a count and carrying an estimate with ≥, and says both', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [estimated(250_000), failed])).toEqual({
			totalLabel: '≥250,000',
			totalDescription:
				'At least 250,000 records: one or more tables’ counts couldn’t be loaded, and some are estimates',
			recordLabels: ['~250,000', '…'],
		});
	});

	it('marks the total only once it has settled', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [estimated(250_000), pending])).toEqual({
			totalLabel: '…',
			recordLabels: ['~250,000', '…'],
		});
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [failed, pending])).toEqual({
			totalLabel: '…',
			recordLabels: ['…', '…'],
		});
	});

	it('shows … for a table whose describe carries no record_count, and counts the total as a lower bound', () => {
		const uncounted: CountQueryResult = { isPending: false, data: {} };
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [uncounted, counted(34)])).toMatchObject({
			totalLabel: '≥34',
			recordLabels: ['…', '34'],
		});
	});

	it('reads a lone record in the singular', () => {
		expect(summarizeDatabaseCounts(['cats', 'dogs'], [counted(1), failed]).totalDescription).toBe(
			'At least 1 record: one or more tables’ counts couldn’t be loaded',
		);
	});

	it('reads 0 records for a database with no tables', () => {
		expect(summarizeDatabaseCounts([], [])).toEqual({ totalLabel: '0', totalDescription: undefined, recordLabels: [] });
	});
});
