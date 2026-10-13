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
	limit = MAX_EXTRA_COLUMNS,
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
	// A count can't exceed the row count, so bucketing by it picks the most common without sorting
	// every distinct key, and keeps first-seen order within a count.
	const byCount: string[][] = [];
	for (const [attribute, { count }] of seen) {
		(byCount[count] ??= []).push(attribute);
	}
	const extras: ExtraRecordAttribute[] = [];
	for (let count = byCount.length - 1; count > 0 && extras.length < limit; count--) {
		const attributes = byCount[count];
		if (!attributes) {
			continue;
		}
		for (const attribute of attributes) {
			if (extras.length === limit) {
				break;
			}
			extras.push({ attribute, type: typeOfValue(seen.get(attribute)!.sample) });
		}
	}
	return extras;
}

export function sameExtraRecordAttributes(a: readonly ExtraRecordAttribute[], b: readonly ExtraRecordAttribute[]) {
	return a === b || (a.length === b.length
		&& a.every((extra, index) => extra.attribute === b[index].attribute && extra.type === b[index].type));
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
