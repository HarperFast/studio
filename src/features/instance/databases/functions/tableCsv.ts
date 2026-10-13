import { extraRecordAttributes } from '@/features/instance/databases/functions/extraRecordAttributes';
import { GetAttribute, isSyntheticAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
import { SchemaRelationship } from '@/features/instance/databases/functions/schemaRelationships';
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';

/**
 * `get_attributes` for a CSV export: the grid's select without its relationships, whose resolved
 * records don't fit a CSV cell. Naming each `@computed` attribute ahead of the `'*'` resolves it, and
 * the `'*'` brings every property a record stores, declared or not. Returns undefined (so `['*']`)
 * when the table has no computed attribute. Why the CSV is written here and not by Harper: DESIGN.md.
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

// Each part's text goes into its own Blob, outside the JS heap, before the next part is written.
const ROWS_PER_PART = 10_000;
const WRITTEN = Object.freeze({});

/**
 * The CSV in harper 5.3.2's `escapeCsvRow` format, reading each cell from the record's own property.
 * Empties `rows` as it goes, so the file's text replaces the records in memory instead of joining them.
 */
export function tableCsvBlob(rows: Record<string, unknown>[], columns: readonly string[]): Blob {
	const parts = [new Blob([csvLine(columns, true)])];
	for (let start = 0; start < rows.length; start += ROWS_PER_PART) {
		const end = Math.min(rows.length, start + ROWS_PER_PART);
		let text = '';
		for (let index = start; index < end; index++) {
			const row = rows[index];
			text += csvLine(columns.map((column) => (Object.hasOwn(row, column) ? row[column] : undefined)), false);
		}
		parts.push(new Blob([text]));
		rows.fill(WRITTEN, start, end);
	}
	rows.length = 0;
	return new Blob(parts, { type: 'text/csv' });
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

export function exportedRecords(data: unknown): Record<string, unknown>[] {
	const parsed = typeof data === 'string' ? parseJsonKeepingLargeIntegers(data) : data;
	if (!Array.isArray(parsed)) {
		throw new Error('The export did not come back as a list of records.');
	}
	return parsed;
}

// Harper's own cheap test for a body that may need its big-number parse (`HAS_BIG_NUMBER`, JSONStream.ts).
// It also matches digits inside a string, so `holdsUnsafeInteger` decides.
const MAY_HOLD_LARGE_INTEGER = /[[,:]\s*-?\d{16,}/;
const INTEGER_SOURCE = /^-?\d+$/;

/**
 * `JSON.parse`, except that an integer a double can't hold keeps its digits. Harper writes a `BigInt`
 * as bare digits, which a plain parse rounds (98765432109876543210 reads as 98765432109876540000),
 * while its own CSV wrote them exactly. Such a number becomes a `JSON.rawJSON` value, which
 * `JSON.stringify` writes back digit for digit. A browser without `JSON.rawJSON` can't do that, so
 * it refuses a body that holds one rather than export rounded values.
 */
export function parseJsonKeepingLargeIntegers(text: string): unknown {
	if (!MAY_HOLD_LARGE_INTEGER.test(text) || !holdsUnsafeInteger(text)) {
		return JSON.parse(text);
	}
	const rawJSON = (JSON as { rawJSON?: (text: string) => unknown }).rawJSON;
	if (!rawJSON) {
		throw new Error(
			'This export holds an integer too large for this browser to read exactly. '
				+ 'Export it from a browser with JSON.rawJSON, such as a current Chrome, Edge or Firefox.',
		);
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

/** Whether a JSON text holds, outside every string, an integer literal a double can't hold. */
function holdsUnsafeInteger(text: string): boolean {
	let inString = false;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (inString) {
			if (code === BACKSLASH) {
				index++;
			} else if (code === QUOTE) {
				inString = false;
			}
		} else if (code === QUOTE) {
			inString = true;
		} else if (code === MINUS || isDigit(code)) {
			let end = index + 1;
			while (end < text.length && isNumberCharacter(text.charCodeAt(end))) {
				end++;
			}
			if (end - index >= 16) {
				const token = text.slice(index, end);
				if (INTEGER_SOURCE.test(token) && !Number.isSafeInteger(Number(token))) {
					return true;
				}
			}
			index = end - 1;
		}
	}
	return false;
}

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const MINUS = 0x2d;

function isDigit(code: number): boolean {
	return code >= 0x30 && code <= 0x39;
}

// Digits, `.`, `+`, `-`, `e` and `E`.
function isNumberCharacter(code: number): boolean {
	return isDigit(code) || code === 0x2e || code === 0x2b || code === MINUS || code === 0x65 || code === 0x45;
}
