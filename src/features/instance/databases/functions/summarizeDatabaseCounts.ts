import { InstanceTable } from '@/integrations/api/api.patch';

export interface CountQueryResult {
	data?: Pick<InstanceTable, 'record_count' | 'estimated_record_range'>;
	isPending: boolean;
}

const PENDING = '…';

function countLabel(recordCount: number, estimated: boolean) {
	return `${estimated ? '~' : ''}${recordCount.toLocaleString()}`;
}

interface TotalNote {
	spoken: string;
	reason: string;
}

const LEFT_OUT = 'One or more tables’ counts couldn’t be loaded and are left out';

function noteTotal(totalRecords: number, incomplete: boolean, estimated: boolean): TotalNote | undefined {
	const records = `${totalRecords.toLocaleString()} ${totalRecords === 1 ? 'record' : 'records'}`;
	if (incomplete && estimated) {
		return { spoken: `At least about ${records}`, reason: `${LEFT_OUT}, and some counts are estimates.` };
	}
	if (incomplete) {
		return { spoken: `At least ${records}`, reason: `${LEFT_OUT}.` };
	}
	return estimated
		? { spoken: `Approximately ${records} (estimated)`, reason: 'One or more tables’ counts are estimates.' }
		: undefined;
}

/**
 * `countQueries[i]` counts `tableNames[i]`, and `recordLabels` keeps that order. The total waits for
 * every query to settle, not to succeed: `describe_table` is `retry: false`, so one failed count would
 * otherwise hold it on `…` while the rest counted fine.
 *
 * A total missing a table's count is marked `≥`, and `~` is left to mean Harper reported an estimate.
 * With both, `≥` still wins, though an estimate in the sum means it is not a strict bound.
 */
export function summarizeDatabaseCounts(
	tableNames: readonly string[],
	countQueries: readonly CountQueryResult[],
): { totalLabel: string; totalNote?: TotalNote; recordLabels: string[] } {
	let totalRecords = 0;
	let anyEstimated = false;
	let anyMissing = false;
	const recordLabels = tableNames.map((_tableName, index) => {
		const data = countQueries[index]?.data;
		if (data?.record_count === undefined) {
			anyMissing = true;
			return PENDING;
		}
		const estimated = !!data.estimated_record_range;
		anyEstimated ||= estimated;
		totalRecords += data.record_count;
		return countLabel(data.record_count, estimated);
	});
	if (countQueries.some((query) => query.isPending)) {
		return { totalLabel: PENDING, recordLabels };
	}
	const marker = anyMissing ? '≥' : anyEstimated ? '~' : '';
	return {
		totalLabel: `${marker}${totalRecords.toLocaleString()}`,
		totalNote: noteTotal(totalRecords, anyMissing, anyEstimated),
		recordLabels,
	};
}
