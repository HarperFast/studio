import { InstanceAttribute } from '@/integrations/api/api.patch';
import { SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';

/** Comparators Harper answers by reading every record, even on an indexed attribute (`resources/search.ts` `searchByIndex`). */
const SCANNING_COMPARATORS: ReadonlySet<SearchCondition['search_type']> = new Set(['ne', 'not_equal']);

/**
 * The attributes that make a filter read every record in the table, or none when an index can serve
 * it. Harper runs an `and` search from its narrowest condition and filters the rest (`resources/Table.ts`
 * `orderConditions`), so a single index-served condition is enough. A relationship join (`[column, subProperty]`) is
 * answered from the related table and counts as served.
 */
export function fullScanAttributes(
	conditions: readonly SearchCondition[],
	attributesMap: Readonly<Record<string, InstanceAttribute>>,
): string[] {
	const scanned = new Set<string>();
	for (const condition of conditions) {
		const { search_attribute: name, search_type: comparator } = condition;
		if (Array.isArray(name)) {
			return [];
		}
		const attribute = attributesMap[name];
		if ((attribute?.is_primary_key || attribute?.indexed) && !SCANNING_COMPARATORS.has(comparator)) {
			return [];
		}
		scanned.add(name);
	}
	return [...scanned];
}

export function fullScanWarning(tableName: string, attributes: readonly string[]): string {
	const names = attributes.map((name) => `"${name}"`).join(', ');
	return `No index can answer this filter on ${names}, so Harper will read every record in "${tableName}" to find the matches. On a large table that can take a long time and slow the server down for everyone using it.\n\nRun it anyway?`;
}
