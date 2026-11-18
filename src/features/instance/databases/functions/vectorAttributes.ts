import { InstanceAttribute, InstanceTable } from '@/integrations/api/api.patch';

export interface VectorAttribute {
	attribute: string;
	/** `cosine`, `euclidean` or `dotProduct`. Harper uses cosine when the schema names none. */
	distance: string;
	/** The field `@embed` fills this one from, when describe says. */
	embedSource?: string;
}

/**
 * Harper refuses a sort or a filter on an HNSW attribute without a target vector ("A target vector must be
 * provided for an HNSW query", `Can not use "equals" comparator with HNSW`), so these columns take neither.
 */
export function isHnswIndexed(indexed: InstanceAttribute['indexed']): boolean {
	return typeof indexed === 'object' && indexed !== null && (indexed as { type?: unknown }).type === 'HNSW';
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
		}];
	});
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

/** The seed for the one record the editor loaded, when it has a key and a vector to search by. */
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
