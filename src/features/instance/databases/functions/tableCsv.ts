import { extraRecordAttributes } from '@/features/instance/databases/functions/extraRecordAttributes';
import { GetAttribute, isSyntheticAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
import { SchemaRelationship } from '@/features/instance/databases/functions/schemaRelationships';
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';

/**
 * `get_attributes` for a CSV export: the grid's select without its relationships, whose resolved
 * records don't fit a CSV cell. Naming each `@computed` attribute ahead of the `'*'` resolves it, and
 * the `'*'` brings every property a record stores, declared or not. Returns undefined (so `['*']`)
 * when the table has no computed attribute.
 *
 * The export reads these records as JSON and writes the CSV itself. Harper's own `text/csv` answer
 * can't carry them: its header is fixed before the first row, from the select (with `'*'` expanded to
 * the declared attributes) or from the first record's keys, so an undeclared property is dropped.
 */
export function buildExportGetAttributes(instanceTable: InstanceTable | undefined): GetAttribute[] | undefined {
	const computed = (instanceTable?.attributes ?? [])
		.filter((attribute) => attribute.computed)
		.map((attribute) => attribute.attribute);
	return computed.length ? [...computed, '*'] : undefined;
}

/**
 * A CSV export's columns: every attribute describe lists, in describe order, except relationships,
 * then every property the records carry that describe doesn't list, most common first as the grid
 * orders them. The extras are counted over every exported record, not one page, and not capped as
 * the grid caps them: a column left out of the file is data lost from it.
 */
export function tableCsvColumns(
	rows: readonly Record<string, unknown>[],
	instanceTable: InstanceTable | undefined,
	databaseTables: InstanceDatabaseTableMap | undefined,
	schemaRelationships?: SchemaRelationship[],
): string[] {
	const attributes = instanceTable?.attributes ?? [];
	const declared = attributes
		.filter((attribute) => attribute.computed || !isSyntheticAttribute(attribute, databaseTables, schemaRelationships))
		.map((attribute) => attribute.attribute);
	// A relationship never becomes an extra column either, under any name the schema gives it.
	const known = new Set([
		...attributes.map((attribute) => attribute.attribute),
		...(schemaRelationships ?? []).map((relationship) => relationship.attribute),
	]);
	const extras = extraRecordAttributes(rows, known, Infinity).map(({ attribute }) => attribute);
	return [...declared, ...extras];
}

/**
 * The CSV as Harper's own `text/csv` serializer writes it (`toCsvStream` / `escapeCsvRow` in
 * `server/serverHelpers/contentTypes.ts`), one string per line: a header with every name quoted, then
 * numbers bare, objects and arrays as JSON, null, undefined and `''` as an empty cell, and anything
 * else quoted with each `"` doubled. Cells are read from the record's own properties only, so a
 * column named `toString` doesn't print a function.
 */
export function tableCsvLines(rows: readonly Record<string, unknown>[], columns: readonly string[]): string[] {
	const lines = [csvLine(columns, true)];
	for (const row of rows) {
		lines.push(csvLine(columns.map((column) => (Object.hasOwn(row, column) ? row[column] : undefined)), false));
	}
	return lines;
}

function csvLine(values: readonly unknown[], quoteAll: boolean): string {
	return values.map((value) => csvCell(value, quoteAll)).join(',') + '\n';
}

function csvCell(value: unknown, quoteAll: boolean): string {
	if (value === null || value === undefined || value === '') {
		return '';
	}
	if (typeof value === 'number' && !quoteAll) {
		return String(value);
	}
	const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
	return `"${text.replace(/"/g, '""')}"`;
}

/** The records a JSON search answered with, read by `parseJsonKeepingLargeIntegers` when still text. */
export function exportedRecords(data: unknown): Record<string, unknown>[] {
	const parsed = typeof data === 'string' ? parseJsonKeepingLargeIntegers(data) : data;
	if (!Array.isArray(parsed)) {
		throw new Error('The export did not come back as a list of records.');
	}
	return parsed;
}

// Harper's own test for whether a JSON body needs its big-number parse (`HAS_BIG_NUMBER`, JSONStream.ts).
const MAY_HOLD_LARGE_INTEGER = /[[,:]\s*-?\d{16,}/;
const INTEGER_SOURCE = /^-?\d+$/;

/**
 * `JSON.parse`, except that an integer a double can't hold keeps its digits. Harper writes a `BigInt`
 * as bare digits, which a plain parse rounds (98765432109876543210 reads as 98765432109876540000),
 * while its own CSV writes them exactly. Where the browser hands a reviver the number's source text,
 * such a number becomes a `JSON.rawJSON` value, which `JSON.stringify` writes back digit for digit.
 * Elsewhere this is a plain parse.
 */
export function parseJsonKeepingLargeIntegers(text: string): unknown {
	const rawJSON = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;
	if (!rawJSON || !MAY_HOLD_LARGE_INTEGER.test(text)) {
		return JSON.parse(text);
	}
	return JSON.parse(
		text,
		(_key, value: unknown, context?: { source?: string }) =>
			typeof value === 'number' && !Number.isSafeInteger(value) && context?.source
				&& INTEGER_SOURCE.test(context.source)
				? rawJSON(context.source)
				: value,
	);
}
