import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute } from '@/integrations/api/api.patch';
import { SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';

/** Comparators Harper answers by reading every record, even on an indexed attribute (`resources/search.ts` `searchByIndex`). */
const SCANNING_COMPARATORS: ReadonlySet<SearchCondition['search_type']> = new Set([
	'contains',
	'ends_with',
	'ne',
	'not_equal',
]);

export interface FullScan {
	/** The column filtered, or `column.subProperty` for a relationship join. */
	attribute: string;
	/** Set for a join, which Harper answers by searching the related table. */
	relatedTableName?: string;
}

/**
 * What makes a filter read every record of a table, or nothing when an index can serve it. Harper
 * runs an `and` search from its narrowest condition and filters the rest (`resources/Table.ts`
 * `orderConditions`), so a single index-served condition is enough.
 */
export function fullScanAttributes(
	conditions: readonly SearchCondition[],
	attributesMap: Readonly<Record<string, InstanceAttribute>>,
	relationshipInfoMap: Readonly<Record<string, RelationshipAttributeInfo>> = {},
): FullScan[] {
	const scans = new Map<string, FullScan>();
	for (const { search_attribute: path, search_type: comparator } of conditions) {
		const [name, subProperty] = Array.isArray(path) ? path : [path];
		const info = subProperty !== undefined && Object.hasOwn(relationshipInfoMap, name)
			? relationshipInfoMap[name]
			: undefined;
		const attribute = info
			? info.relatedAttributes.find((related) => related.attribute === subProperty)
			: attributesMap[name];
		if ((attribute?.is_primary_key || attribute?.indexed) && !SCANNING_COMPARATORS.has(comparator)) {
			return [];
		}
		const label = subProperty === undefined ? name : `${name}.${subProperty}`;
		scans.set(label, { attribute: label, relatedTableName: info?.relatedTableName });
	}
	return [...scans.values()];
}

export function fullScanQuestion(
	tableName: string,
	scans: readonly FullScan[],
): { title: string; description: string } {
	const attributes = scans.map(({ attribute }) => `"${attribute}"`).join(', ');
	const tables = [...new Set(scans.map((scan) => scan.relatedTableName ?? tableName))]
		.map((name) => `"${name}"`)
		.join(' and ');
	return {
		title: `Scan every record in ${tables}?`,
		description:
			`No index can answer this filter on ${attributes}, so Harper will read every record in ${tables} to find the matches. On a large table that can take a long time and slow the server down for everyone using it.`,
	};
}
