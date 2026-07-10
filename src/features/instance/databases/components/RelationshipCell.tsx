import { Badge } from '@/components/ui/badge';
import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { Link, useParams } from '@tanstack/react-router';

const MAX_CHIPS = 3;

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

export function RelationshipCell({ value, info }: { value: unknown; info: RelationshipAttributeInfo }) {
	const params: { organizationId?: string; clusterId?: string; instanceId?: string; databaseName?: string } = useParams(
		{ strict: false },
	);
	const keyValues = relationshipKeyValues(value, info);
	if (!keyValues.length) {
		return <span className="text-muted-foreground">&mdash;</span>;
	}
	const relatedTableLink = buildAbsoluteLinkToDatabasePage({ ...params, tableName: info.relatedTableName });
	return (
		<span className="inline-flex gap-1 items-center">
			{keyValues.slice(0, MAX_CHIPS).map((keyValue, index) => (
				<Badge key={index} variant="outline" asChild>
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
			{keyValues.length > MAX_CHIPS && (
				<span className="text-muted-foreground text-xs">+{keyValues.length - MAX_CHIPS} more</span>
			)}
		</span>
	);
}
