import { ownEntry } from '@/features/instance/databases/functions/describedTable';
import type { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute, InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import type { SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';

export interface VectorAttribute {
	attribute: string;
	/** `cosine`, `euclidean` or `dotProduct`. Harper uses cosine when the schema names none. */
	distance: string;
	/** The field `@embed` fills this one from, when describe says. */
	embedSource?: string;
	embedModel?: string;
}

/**
 * Harper refuses a sort or a filter on an HNSW attribute without a target vector ("A target vector must be
 * provided for an HNSW query", `Can not use "equals" comparator with HNSW`), so these columns take neither.
 */
export function isHnswIndexed(indexed: InstanceAttribute['indexed']): boolean {
	return typeof indexed === 'object' && indexed !== null && (indexed as { type?: unknown }).type === 'HNSW';
}

/**
 * The first condition's attribute, as `column` or `column.subProperty`, that is an HNSW attribute here or on
 * the related table it joins to. The grid offers no such filter, but a deep link or typed `.subProperty` can.
 */
export function vectorFilterAttribute(
	conditions: readonly Pick<SearchCondition, 'search_attribute'>[],
	attributesMap: Readonly<Record<string, InstanceAttribute>>,
	relationshipInfoMap: Readonly<Record<string, RelationshipAttributeInfo>>,
	databaseTables: InstanceDatabaseTableMap | undefined,
): string | undefined {
	for (const { search_attribute: path } of conditions) {
		const [name, subProperty] = Array.isArray(path) ? path : [path];
		if (subProperty === undefined) {
			if (Object.hasOwn(attributesMap, name) && isHnswIndexed(attributesMap[name].indexed)) {
				return name;
			}
			continue;
		}
		const relatedTableName = Object.hasOwn(relationshipInfoMap, name)
			? relationshipInfoMap[name].relatedTableName
			: undefined;
		const relatedTable = relatedTableName ? ownEntry(databaseTables, relatedTableName) : undefined;
		if (
			relatedTable?.attributes?.some(({ attribute, indexed }) => attribute === subProperty && isHnswIndexed(indexed))
		) {
			return `${name}.${subProperty}`;
		}
	}
	return undefined;
}

export function vectorAttributes(table: InstanceTable | undefined): VectorAttribute[] {
	return (table?.attributes ?? []).flatMap(({ attribute, indexed, embed }) => {
		if (!isHnswIndexed(indexed)) {
			return [];
		}
		const distance = (indexed as { distance?: unknown }).distance;
		return [{
			attribute,
			distance: typeof distance === 'string' ? distance : 'cosine',
			embedSource: typeof embed?.source === 'string' ? embed.source : undefined,
			embedModel: typeof embed?.source === 'string' && typeof embed.model === 'string' ? embed.model : undefined,
		}];
	});
}

/** The fields a search by text can use: Harper embeds the text with the field's own `@embed` model. */
export function textSearchableVectors(vectors: readonly VectorAttribute[]): VectorAttribute[] {
	return vectors.filter(vector => vector.embedSource !== undefined);
}

const PREVIEW_ATTRIBUTES = 3;

/**
 * What a similar-records result shows besides its key: the text the vector was embedded from first, then
 * other described `String` attributes. Computed ones are left out, since each costs a resolution per hit.
 */
export function previewAttributes(table: InstanceTable, primaryKey: string, vector: VectorAttribute): string[] {
	const strings = table.attributes
		.filter(({ attribute, type, computed }) => type === 'String' && !computed && attribute !== primaryKey)
		.map(({ attribute }) => attribute);
	const source = vector.embedSource !== undefined && strings.includes(vector.embedSource) ? [vector.embedSource] : [];
	return [...source, ...strings.filter(attribute => attribute !== vector.embedSource)].slice(0, PREVIEW_ATTRIBUTES);
}

export function isVector(value: unknown): value is number[] {
	return Array.isArray(value) && value.length > 0
		&& value.every(item => typeof item === 'number' && Number.isFinite(item));
}

export interface SimilarRecordsSeed {
	key: unknown;
	vectors: ReadonlyMap<string, number[]>;
}

export function similarRecordsSeed(
	records: readonly Record<string, unknown>[] | undefined,
	primaryKey: string,
	vectors: readonly VectorAttribute[],
): SimilarRecordsSeed | undefined {
	if (records?.length !== 1 || !primaryKey || vectors.length === 0) {
		return undefined;
	}
	const [record] = records;
	const key = Object.hasOwn(record, primaryKey) ? record[primaryKey] : undefined;
	if (key == null) {
		return undefined;
	}
	const found = new Map<string, number[]>();
	for (const { attribute } of vectors) {
		const value = Object.hasOwn(record, attribute) ? record[attribute] : undefined;
		if (isVector(value)) {
			found.set(attribute, value);
		}
	}
	return found.size > 0 ? { key, vectors: found } : undefined;
}

const SUMMARIZED_AFTER = 8;
const SHOWN = 3;

/**
 * `768 numbers: [0.01235, -0.04561, 0.07891, …]` for an array of more than {@link SUMMARIZED_AFTER}
 * numbers. The count leads, so a narrow column cuts the numbers rather than how many there are.
 */
export function summarizeNumberArray(value: unknown): string | undefined {
	if (
		!Array.isArray(value) || value.length <= SUMMARIZED_AFTER
		|| !value.every(item => typeof item === 'number' && Number.isFinite(item))
	) {
		return undefined;
	}
	return `${value.length} numbers: [${value.slice(0, SHOWN).map(formatNumber).join(', ')}, …]`;
}

/** Four significant digits, whatever the locale, and integers whole. */
export function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(4)));
}
