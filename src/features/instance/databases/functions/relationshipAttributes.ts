import { InstanceAttribute, InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';

/**
 * Relationship attributes (`@relationship` in a table schema) are computed at read time from a
 * foreign key: they cannot be written, and `describe_table` carries no explicit flag for them.
 * The detectable signal is their type: a to-one relationship's `type` is the related table's
 * name, and a to-many relationship is an `array` whose `elements` is the related table's name.
 * Newer Harper versions (5.1+) omit relationship attributes from describe entirely, in which
 * case none of this activates and browse behaves as before.
 */
export interface RelationshipAttributeInfo {
	/** Name of the related table (within the same database). */
	relatedTableName: string;
	/** Primary key attribute of the related table. */
	relatedPrimaryKey: string;
	/** Attributes of the related table, for sub-property pickers and filter value casting. */
	relatedAttributes: InstanceAttribute[];
	/** True for one-to-many/many-to-many (the value is an array of related records). */
	isToMany: boolean;
	/** False when describe carried no element type (legacy attribute registries): the values
	 * can't be requested via a nested select, so cells fall back to the reverse-key link. */
	resolvable: boolean;
	/** Attribute on the related table pointing back at this row's primary key (e.g. Tracks.albumId
	 * for Albums.tracks). Lets cells link to the related table filtered to this row's records. */
	reverseForeignKey?: string;
}

/** The table another attribute's type points at, if any: `type` for to-one, `elements` for to-many. */
function relatedTableNameOf(
	attribute: InstanceAttribute,
	databaseTables: InstanceDatabaseTableMap,
): string | undefined {
	if (attribute.type === 'array') {
		if (attribute.elements) {
			return databaseTables[attribute.elements] ? attribute.elements : undefined;
		}
		// Tables created before Harper 5 can carry legacy relationship attributes whose describe
		// output is just {type: 'array'} with no element type. Fall back to matching the attribute
		// name against sibling table names (tracks → Tracks / Track).
		return findSiblingTableByName(databaseTables, attribute.attribute);
	}
	return attribute.type && databaseTables[attribute.type] ? attribute.type : undefined;
}

function findSiblingTableByName(
	databaseTables: InstanceDatabaseTableMap,
	attributeName: string,
): string | undefined {
	const lowered = attributeName.toLowerCase();
	const variants = new Set([lowered, `${lowered}s`, lowered.replace(/s$/, '')]);
	return Object.keys(databaseTables).find((tableName) => variants.has(tableName.toLowerCase()));
}

export function getRelationshipInfo(
	attribute: InstanceAttribute,
	databaseTables: InstanceDatabaseTableMap | undefined,
	/** The table the attribute belongs to; when given, to-many infos get a `reverseForeignKey`. */
	ownerTable?: InstanceTable,
): RelationshipAttributeInfo | undefined {
	if (!databaseTables || attribute.is_primary_key || attribute.computed) {
		return undefined;
	}
	const relatedTableName = relatedTableNameOf(attribute, databaseTables);
	const relatedTable = relatedTableName ? databaseTables[relatedTableName] : undefined;
	if (!relatedTableName || !relatedTable) {
		return undefined;
	}
	const relatedPrimaryKey = relatedTable.primary_key ?? relatedTable.hash_attribute;
	if (!relatedPrimaryKey) {
		return undefined;
	}
	const isToMany = attribute.type === 'array';
	return {
		relatedTableName,
		relatedPrimaryKey,
		// Exclude the related table's own relationship/computed attributes: filters join one hop
		// (`[column, subProperty]`), so deeper synthetic attributes can't be queried through here.
		relatedAttributes: (relatedTable.attributes ?? []).filter(
			(related) => !related.computed && !relatedTableNameOf(related, databaseTables),
		),
		isToMany,
		resolvable: !isToMany || Boolean(attribute.elements),
		reverseForeignKey: isToMany && ownerTable
			? inferReverseForeignKey(ownerTable, relatedTable, databaseTables)
			: undefined,
	};
}

/**
 * The attribute on the related table that points back at the owner table's primary key —
 * Tracks.albumId for Albums.tracks. Preferred source: a to-one relationship on the related table
 * whose target is the owner table (its foreign key is the reverse key by definition). Fallback:
 * the `<singular owner table>Id` naming convention.
 */
function inferReverseForeignKey(
	ownerTable: InstanceTable,
	relatedTable: InstanceTable,
	databaseTables: InstanceDatabaseTableMap,
): string | undefined {
	const relatedAttributes = relatedTable.attributes ?? [];
	for (const attribute of relatedAttributes) {
		const backReference = getRelationshipInfo(attribute, databaseTables);
		if (backReference && !backReference.isToMany && backReference.relatedTableName === ownerTable.name) {
			const foreignKey = relationshipForeignKeyName(
				attribute.attribute,
				backReference,
				relatedAttributes,
				databaseTables,
			);
			if (foreignKey) {
				return foreignKey;
			}
		}
	}
	const base = ownerTable.name.toLowerCase();
	const candidates = new Set(
		[base, base.replace(/s$/, '')].flatMap((name) => [`${name}id`, `${name}_id`]),
	);
	return relatedAttributes.find((attribute) =>
		!attribute.is_primary_key
		&& !attribute.computed
		&& candidates.has(attribute.attribute.toLowerCase())
	)?.attribute;
}

/** Map of attribute name → relationship info for every relationship attribute of a table. */
export function getRelationshipInfoMap(
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
): Record<string, RelationshipAttributeInfo> {
	const map: Record<string, RelationshipAttributeInfo> = {};
	for (const attribute of instanceTable?.attributes ?? []) {
		const info = getRelationshipInfo(attribute, databaseTables, instanceTable);
		if (info) {
			map[attribute.attribute] = info;
		}
	}
	return map;
}

/**
 * Attributes the server computes and refuses to accept in writes: `@computed` attributes and
 * relationship attributes. Including one in an insert/update — even as `null` — fails with
 * "Computed property X may not be directly assigned a value".
 */
export function isSyntheticAttribute(
	attribute: InstanceAttribute,
	databaseTables: InstanceDatabaseTableMap | undefined,
): boolean {
	return Boolean(attribute.computed) || getRelationshipInfo(attribute, databaseTables) !== undefined;
}

export function syntheticAttributeNames(
	attributes: InstanceAttribute[] | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
): string[] {
	return (attributes ?? [])
		.filter((attribute) => isSyntheticAttribute(attribute, databaseTables))
		.map((attribute) => attribute.attribute);
}

/**
 * The stored foreign-key attribute a relationship reads from, inferred by naming convention —
 * `product` → `productId`, `pets` → `petIds` — since describe_table does not expose the
 * `@relationship(from/to)` mapping. Browse collapses the pair into just the relationship column
 * (the chips show the same key values), with the foreign key re-showable from the Columns picker
 * in case the inference is wrong for an unconventionally named key.
 */
export function relationshipForeignKeyName(
	attributeName: string,
	info: RelationshipAttributeInfo,
	attributes: InstanceAttribute[],
	databaseTables: InstanceDatabaseTableMap | undefined,
): string | undefined {
	const bases = [attributeName];
	if (info.isToMany && attributeName.endsWith('s')) {
		bases.push(attributeName.slice(0, -1));
	}
	const suffixes = info.isToMany ? ['ids', '_ids'] : ['id', '_id'];
	const candidates = new Set(bases.flatMap((base) => suffixes.map((suffix) => (base + suffix).toLowerCase())));
	return attributes.find((attribute) =>
		!attribute.is_primary_key
		&& !attribute.computed
		&& !getRelationshipInfo(attribute, databaseTables)
		&& candidates.has(attribute.attribute.toLowerCase())
	)?.attribute;
}

/** Foreign-key column names browse hides by default because a relationship column covers them. */
export function collapsedForeignKeyNames(
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
): string[] {
	const attributes = instanceTable?.attributes ?? [];
	const names = new Set<string>();
	for (const attribute of attributes) {
		const info = getRelationshipInfo(attribute, databaseTables);
		if (!info) {
			continue;
		}
		const foreignKey = relationshipForeignKeyName(attribute.attribute, info, attributes, databaseTables);
		if (foreignKey) {
			names.add(foreignKey);
		}
	}
	return [...names];
}

export type GetAttribute = string | { name: string; select: string[] };

/**
 * `get_attributes` list that resolves relationship attributes to their related records' primary
 * keys. Plain `['*']` returns raw records with relationship attributes missing (blank cells);
 * naming them with a nested select resolves them. The `'*'` must come last: a leading `'*'`
 * makes the server return raw records and ignore the rest of the list.
 * Returns undefined when the table has no relationship attributes (callers fall back to `['*']`).
 */
export function buildRelationshipGetAttributes(
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
): GetAttribute[] | undefined {
	const selects: GetAttribute[] = [];
	for (const attribute of instanceTable?.attributes ?? []) {
		const info = getRelationshipInfo(attribute, databaseTables);
		if (info?.resolvable) {
			selects.push({ name: attribute.attribute, select: [info.relatedPrimaryKey] });
		}
	}
	return selects.length ? [...selects, '*'] : undefined;
}
