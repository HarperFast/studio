import { Badge } from '@/components/ui/badge';
import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { Link, useParams } from '@tanstack/react-router';

const MAX_CHIPS = 3;

/** The app's link blue (readable in both themes, unlike the near-background primary purple). */
const linkChipClassName = 'text-blue dark:text-blue-300 border-blue/40 dark:border-blue-300/40 '
	+ '[a&]:hover:bg-blue/10 [a&]:hover:underline';

/**
 * Primary key values of the related records inside a resolved relationship cell value.
 * Browse queries resolve relationship attributes to `{ [relatedPrimaryKey]: value }`
 * (or an array of those for to-many); older servers may leave the value null/undefined.
 */
export function relationshipKeyValues(value: unknown, info: RelationshipAttributeInfo): unknown[] {
	const records = Array.isArray(value) ? value : value == null ? [] : [value];
	return records
		.map((record) =>
			record !== null && typeof record === 'object'
				? (record as Record<string, unknown>)[info.relatedPrimaryKey]
				: record
		)
		.filter((keyValue) => keyValue != null);
}

export function RelationshipCell({
	value,
	rowKeyValue,
	info,
}: {
	value: unknown;
	/** This row's primary key value, for reverse-key links into the related table. */
	rowKeyValue?: unknown;
	info: RelationshipAttributeInfo;
}) {
	const params: { organizationId?: string; clusterId?: string; instanceId?: string; databaseName?: string } = useParams(
		{ strict: false },
	);
	const keyValues = relationshipKeyValues(value, info);
	const relatedTableLink = buildAbsoluteLinkToDatabasePage({ ...params, tableName: info.relatedTableName });
	// Filter on the related table's own key pointing back at this row: all related records at once.
	const reverseSearch = info.reverseForeignKey && rowKeyValue != null
		? { filters: { [info.reverseForeignKey]: String(rowKeyValue) } }
		: undefined;

	if (!keyValues.length) {
		// Unresolved (legacy attribute registries, or servers that don't resolve relationships):
		// without values, the reverse key is still enough to link to the related records.
		if (!reverseSearch) {
			return <span className="text-muted-foreground">&mdash;</span>;
		}
		return (
			<Badge variant="outline" className={linkChipClassName} asChild>
				<Link
					to={relatedTableLink}
					search={reverseSearch}
					onClick={onClickStopPropagation}
					title={`${info.relatedTableName} where ${info.reverseForeignKey} = ${String(rowKeyValue)}`}
				>
					{info.relatedTableName} &rarr;
				</Link>
			</Badge>
		);
	}
	const overflow = keyValues.length - MAX_CHIPS;
	return (
		<span className="inline-flex gap-1 items-center">
			{keyValues.slice(0, MAX_CHIPS).map((keyValue, index) => (
				<Badge key={index} variant="outline" className={linkChipClassName} asChild>
					<Link
						to={relatedTableLink}
						search={{ filters: { [info.relatedPrimaryKey]: String(keyValue) } }}
						onClick={onClickStopPropagation}
						title={`${info.relatedTableName} where ${info.relatedPrimaryKey} = ${String(keyValue)}`}
					>
						{String(keyValue)}
					</Link>
				</Badge>
			))}
			{overflow > 0 && (reverseSearch
				? (
					<Link
						to={relatedTableLink}
						search={reverseSearch}
						onClick={onClickStopPropagation}
						className="text-blue dark:text-blue-300 hover:underline text-xs whitespace-nowrap"
						title={`${info.relatedTableName} where ${info.reverseForeignKey} = ${String(rowKeyValue)}`}
					>
						+{overflow} more
					</Link>
				)
				: <span className="text-muted-foreground text-xs whitespace-nowrap">+{overflow} more</span>)}
		</span>
	);
}
