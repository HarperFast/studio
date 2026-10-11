import { InstanceAttribute } from '@/integrations/api/api.patch';

/** A page whose records each carry their own keys would otherwise render a column per record. */
export const MAX_EXTRA_COLUMNS = 25;

export interface ExtraRecordAttribute {
	attribute: string;
	/** Read off the first non-null value, for the column's default width. */
	type: InstanceAttribute['type'];
}

/**
 * Properties the loaded records carry that the table's columns don't cover. Describe lists only what
 * the schema declares, and a table that isn't `@sealed` stores whatever else a record brings. The
 * most common come first, as hdbms ordered them.
 */
export function extraRecordAttributes(
	rows: readonly Record<string, unknown>[],
	knownAttributes: ReadonlySet<string>,
): ExtraRecordAttribute[] {
	const seen = new Map<string, { count: number; sample: unknown }>();
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (knownAttributes.has(key)) {
				continue;
			}
			const entry = seen.get(key);
			if (entry) {
				entry.count++;
				entry.sample ??= row[key];
			} else {
				seen.set(key, { count: 1, sample: row[key] });
			}
		}
	}
	return [...seen]
		.sort(([, a], [, b]) => b.count - a.count)
		.slice(0, MAX_EXTRA_COLUMNS)
		.map(([attribute, { sample }]) => ({ attribute, type: typeOfValue(sample) }));
}

export function sameExtraRecordAttributes(a: readonly ExtraRecordAttribute[], b: readonly ExtraRecordAttribute[]) {
	return a === b || a.length === b.length
			&& a.every((extra, index) => extra.attribute === b[index].attribute && extra.type === b[index].type);
}

function typeOfValue(value: unknown): InstanceAttribute['type'] {
	switch (typeof value) {
		case 'number':
			return Number.isInteger(value) ? 'Int' : 'Float';
		case 'boolean':
			return 'Boolean';
		case 'string':
			return 'String';
		default:
			return 'Any';
	}
}
