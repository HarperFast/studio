import { extraRecordAttributes } from '@/features/instance/databases/functions/extraRecordAttributes';
import { GetAttribute, isSyntheticAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
import { SchemaRelationship } from '@/features/instance/databases/functions/schemaRelationships';
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';

/**
 * `get_attributes` for a CSV export: the grid's select without its relationships, whose resolved
 * records don't fit a CSV cell. Naming each `@computed` attribute ahead of the `'*'` resolves it, and
 * the `'*'` brings every property a record stores, declared or not. Why the CSV is written here and
 * not by Harper: DESIGN.md.
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

// A part's text goes into its own Blob, outside the JS heap, before the next part is written. The
// length bound keeps a wide part well under the engine's longest string.
const ROWS_PER_PART = 10_000;
const CHARACTERS_PER_PART = 1 << 24;
const WRITTEN = Object.freeze({});

/**
 * The CSV in harper 5.3.2's `escapeCsvRow` format, reading each cell from the record's own property.
 * Empties `rows` as it goes, so the file's text replaces the records in memory instead of joining them.
 */
export function tableCsvBlob(rows: Record<string, unknown>[], columns: readonly string[]): Blob {
	const parts = [new Blob([columns.map((column) => csvCell(column, true)).join(',') + '\n'])];
	let text = '';
	let partStart = 0;
	for (let index = 0; index < rows.length; index++) {
		text += csvRow(rows[index], columns);
		const partEnd = index + 1;
		if (partEnd - partStart === ROWS_PER_PART || text.length >= CHARACTERS_PER_PART || partEnd === rows.length) {
			parts.push(new Blob([text]));
			rows.fill(WRITTEN, partStart, partEnd);
			partStart = partEnd;
			text = '';
		}
	}
	rows.length = 0;
	return new Blob(parts, { type: 'text/csv' });
}

function csvRow(row: Record<string, unknown>, columns: readonly string[]): string {
	let line = '';
	for (let index = 0; index < columns.length; index++) {
		const column = columns[index];
		line += (index ? ',' : '') + csvCell(Object.hasOwn(row, column) ? row[column] : undefined, false);
	}
	return line + '\n';
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
// It also matches digits inside a string, which `quoteUnsafeIntegers` leaves alone.
const MAY_HOLD_LARGE_INTEGER = /[[,:]\s*-?\d{16,}/;
const INTEGER_SOURCE = /^-?\d+$/;

/**
 * `JSON.parse`, except that an integer literal whose digits a double would change is read as a string
 * of them. Harper writes a `BigInt` as bare digits, which a plain parse rounds (98765432109876543210
 * reads as 98765432109876540000), while its own CSV wrote them exactly, as a quoted cell. A double
 * Harper wrote (`1e17` as 100000000000000000) reads back with the same digits, so stays a number.
 */
export function parseJsonKeepingLargeIntegers(text: string): unknown {
	return JSON.parse(MAY_HOLD_LARGE_INTEGER.test(text) ? quoteUnsafeIntegers(text) : text);
}

// Only outside a string: digits inside one are already exact.
function quoteUnsafeIntegers(text: string): string {
	let quoted = '';
	let copiedTo = 0;
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
				if (INTEGER_SOURCE.test(token) && String(Number(token)) !== token) {
					quoted += `${text.slice(copiedTo, index)}"${token}"`;
					copiedTo = end;
				}
			}
			index = end - 1;
		}
	}
	return copiedTo ? quoted + text.slice(copiedTo) : text;
}

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const MINUS = 0x2d;
const PLUS = 0x2b;
const DOT = 0x2e;
const LOWER_E = 0x65;
const UPPER_E = 0x45;

function isDigit(code: number): boolean {
	return code >= 0x30 && code <= 0x39;
}

function isNumberCharacter(code: number): boolean {
	return isDigit(code) || code === DOT || code === PLUS || code === MINUS || code === LOWER_E || code === UPPER_E;
}
