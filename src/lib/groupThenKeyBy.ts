import { groupBy } from '@/lib/groupBy';
import { keyBy } from '@/lib/keyBy';

export function groupThenKeyBy<T extends object>(
	items: T[],
	groupByKey: keyof T,
	keyByKey: keyof T,
): Record<string, Record<string, T>> {
	const grouped = groupBy(items, groupByKey);
	const keyed: Record<string, Record<string, T>> = {};
	for (const groupName in grouped) {
		keyed[groupName] = keyBy(grouped[groupName], keyByKey);
	}
	return keyed;
}
