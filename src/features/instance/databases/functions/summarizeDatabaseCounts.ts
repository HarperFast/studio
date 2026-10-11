import { InstanceTable } from '@/integrations/api/api.patch';

export interface CountQueryResult {
	data?: Pick<InstanceTable, 'record_count' | 'estimated_record_range'>;
	isPending: boolean;
}

const PENDING = '…';

function countLabel(recordCount: number, estimated: boolean) {
	return `${estimated ? '~' : ''}${recordCount.toLocaleString()}`;
}

/**
 * `countQueries[i]` counts `tableNames[i]`, and `recordLabels` keeps that order. The total waits for
 * every query to settle, not to succeed: `describe_table` is `retry: false`, so one failed count would
 * otherwise hold it on `…` while the rest counted fine.
 */
export function summarizeDatabaseCounts(
	tableNames: readonly string[],
	countQueries: readonly CountQueryResult[],
): { totalLabel: string; recordLabels: string[] } {
	let totalRecords = 0;
	let anyEstimated = false;
	const recordLabels = tableNames.map((_tableName, index) => {
		const data = countQueries[index]?.data;
		if (!data) {
			return PENDING;
		}
		const estimated = !!data.estimated_record_range;
		anyEstimated ||= estimated;
		if (data.record_count === undefined) {
			return PENDING;
		}
		totalRecords += data.record_count;
		return countLabel(data.record_count, estimated);
	});
	const allSettled = countQueries.every((query) => !query.isPending);
	return {
		totalLabel: allSettled ? countLabel(totalRecords, anyEstimated) : PENDING,
		recordLabels,
	};
}
