import { ownEntry } from '@/features/instance/databases/functions/describedTable';
import { SchemaRelationship } from '@/features/instance/databases/functions/schemaRelationships';
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
	/** False when the server can't resolve the values via a nested select (the attribute is
	 * missing from describe): cells fall back to the stored foreign key or the reverse-key link. */
	resolvable: boolean;
	/** Attribute on the related table pointing back at this row's primary key (e.g. Tracks.albumId
	 * for Albums.tracks). Lets cells link to the related table filtered to this row's records. */
	reverseForeignKey?: string;
	/** Stored attribute on this table holding the related key(s) (e.g. Product.categoryId for
	 * Product.category), taken EXACTLY from `@relationship(from:)` in a component schema — never
	 * guessed by naming convention, so the column collapse, unresolved-cell rendering, and
	 * primary-key filter shortcut never act on a column the relationship doesn't actually read. */
	foreignKeyAttribute?: string;
}

/**
 * The table another attribute's type points at, if any: `type` for to-one, `elements` for to-many.
 * An array with no `elements` is never a relationship, whatever it is named: describe types every
 * to-many relationship it reports, and the rest come from `schemaRelationships`.
 */
function relatedTableNameOf(
	attribute: InstanceAttribute,
	databaseTables: InstanceDatabaseTableMap,
): string | undefined {
	const relatedTableName = attribute.type === 'array' ? attribute.elements : attribute.type;
	return relatedTableName && Object.hasOwn(databaseTables, relatedTableName) ? relatedTableName : undefined;
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
	// foreignKeyAttribute is intentionally NOT inferred here: describe alone can't tell which stored
	// column a relationship reads from, and guessing by name convention risks collapsing/reading an
	// unrelated column. It is set only from an exact schema `@relationship(from:)` in
	// getRelationshipInfoMap. Describe-reported relationships resolve their values via nested select
	// (resolvable), so they never need it.
	return {
		relatedTableName,
		relatedPrimaryKey,
		relatedAttributes: joinableAttributes(relatedTable, databaseTables),
		isToMany,
		resolvable: true,
		reverseForeignKey: isToMany && ownerTable
			? inferReverseForeignKey(ownerTable, relatedTable, databaseTables)
			: undefined,
	};
}

/**
 * The related table's attributes that filters can join through. Excludes its own
 * relationship/computed attributes: filters join one hop (`[column, subProperty]`), so deeper
 * synthetic attributes can't be queried through here.
 */
function joinableAttributes(
	relatedTable: InstanceTable,
	databaseTables: InstanceDatabaseTableMap,
): InstanceAttribute[] {
	return (relatedTable.attributes ?? []).filter(
		(related) => !related.computed && !relatedTableNameOf(related, databaseTables),
	);
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

/**
 * Map of attribute name → relationship info for every relationship attribute of a table.
 *
 * Two sources merge here: attributes reported by describe (detected by their table-named
 * type/elements, keys inferred by convention), and relationships declared in component schema
 * files (`schemaRelationships`) — the only source on Harper 5.1, and authoritative for the
 * `from:`/`to:` key mappings wherever available.
 */
export function getRelationshipInfoMap(
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
	schemaRelationships?: SchemaRelationship[],
): Record<string, RelationshipAttributeInfo> {
	const map: Record<string, RelationshipAttributeInfo> = {};
	for (const attribute of instanceTable?.attributes ?? []) {
		const info = getRelationshipInfo(attribute, databaseTables, instanceTable);
		if (info) {
			map[attribute.attribute] = info;
		}
	}
	for (const declared of schemaRelationships ?? []) {
		const relatedTable = ownEntry(databaseTables, declared.relatedTableName);
		const relatedPrimaryKey = relatedTable?.primary_key ?? relatedTable?.hash_attribute;
		if (!relatedTable || !relatedPrimaryKey || !databaseTables) {
			continue;
		}
		const detected = map[declared.attribute];
		map[declared.attribute] = {
			relatedTableName: declared.relatedTableName,
			relatedPrimaryKey,
			relatedAttributes: joinableAttributes(relatedTable, databaseTables),
			isToMany: declared.isToMany,
			// Nested selects only resolve when the server reports the attribute in describe.
			resolvable: detected?.resolvable ?? false,
			reverseForeignKey: (declared.isToMany ? declared.to : undefined) ?? detected?.reverseForeignKey,
			// Only the exact declared key — describe-detected relationships carry none (see above).
			foreignKeyAttribute: declared.from,
		};
	}
	return map;
}

/**
 * Attributes the server computes and refuses to accept in writes: `@computed` attributes and
 * relationship attributes. Including one in an insert/update — even as `null` — fails with
 * "Computed property X may not be directly assigned a value".
 *
 * A relationship can also be one only the component schema declares, while describe reports the
 * same name as a plain attribute (an untyped array a legacy attribute registry kept), so the
 * table's `schemaRelationships` count too.
 */
export function isSyntheticAttribute(
	attribute: InstanceAttribute,
	databaseTables: InstanceDatabaseTableMap | undefined,
	schemaRelationships?: SchemaRelationship[],
): boolean {
	return Boolean(attribute.computed)
		|| getRelationshipInfo(attribute, databaseTables) !== undefined
		|| !!schemaRelationships?.some((declared) => declared.attribute === attribute.attribute);
}

export function syntheticAttributeNames(
	attributes: InstanceAttribute[] | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
	schemaRelationships?: SchemaRelationship[],
): string[] {
	return (attributes ?? [])
		.filter((attribute) => isSyntheticAttribute(attribute, databaseTables, schemaRelationships))
		.map((attribute) => attribute.attribute);
}

/**
 * Guess the stored foreign-key attribute a relationship reads from by naming convention —
 * `product` → `productId`, `pets` → `petIds`. Used only as a heuristic to locate the REVERSE key
 * of a to-many relationship (see `inferReverseForeignKey`), where a wrong guess merely yields a
 * link that filters to nothing. The forward foreign key that drives column collapse and cell
 * rendering is NEVER guessed — it comes only from an exact schema `@relationship(from:)`.
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
	relationshipInfoMap: Record<string, RelationshipAttributeInfo>,
): string[] {
	const names = new Set<string>();
	for (const info of Object.values(relationshipInfoMap)) {
		if (info.foreignKeyAttribute) {
			names.add(info.foreignKeyAttribute);
		}
	}
	return [...names];
}

export type GetAttribute = string | { name: string; select: string[] };

/**
 * `get_attributes` list that resolves the attributes Harper computes at read time: relationship
 * attributes to their related records' primary keys, and `@computed` attributes by name. Plain
 * `['*']` returns only what is stored, so both read as blank cells; naming them resolves them.
 * The `'*'` must come last: a leading `'*'` makes the server return stored records and ignore the
 * rest of the list.
 * Returns undefined when the table has neither (callers fall back to `['*']`).
 */
export function buildSyntheticGetAttributes(
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
): GetAttribute[] | undefined {
	const selects: GetAttribute[] = [];
	for (const attribute of instanceTable?.attributes ?? []) {
		if (attribute.computed) {
			selects.push(attribute.attribute);
			continue;
		}
		const info = getRelationshipInfo(attribute, databaseTables);
		if (info?.resolvable) {
			selects.push({ name: attribute.attribute, select: [info.relatedPrimaryKey] });
		}
	}
	return selects.length ? [...selects, '*'] : undefined;
}
