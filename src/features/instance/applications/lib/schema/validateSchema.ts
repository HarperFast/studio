/**
 * Structural validation for the visual schema editor. These are the states that
 * would serialize to invalid GraphQL SDL (which Harper rejects wholesale, so the
 * *whole* schema fails to load) if written to disk. The editor surfaces them
 * inline and blocks Save until they're resolved, so the GUI can't produce a file
 * that breaks the deployment.
 *
 * Only tables that will actually be emitted are checked: a blank-named table is
 * dropped by {@link ./serializeSchema.serializeSchema} (it's an in-progress add),
 * and a blank-named field is skipped by `generateTable`, so neither can reach the
 * file — flagging them would just nag about work in progress.
 */
import { GRAPHQL_NAME_HINT, isValidGraphqlName } from './graphqlName';
import { SchemaDocument, TableModel } from './types';

export type SchemaErrorCode =
	| 'INVALID_TABLE_NAME'
	| 'DUPLICATE_TABLE_NAME'
	| 'NO_FIELDS'
	| 'INVALID_FIELD_NAME'
	| 'DUPLICATE_FIELD_NAME';

export interface SchemaValidationError {
	tableId: string;
	/** The table's type name (for messages); never blank here (blank tables are skipped). */
	tableName: string;
	/** Present for field-level errors; anchors the inline highlight to that field. */
	fieldKey?: string;
	/** The offending field's name, for the summary; present with {@link fieldKey}. */
	fieldName?: string;
	code: SchemaErrorCode;
	message: string;
}

function tablesOf(doc: SchemaDocument): TableModel[] {
	return doc.segments.flatMap(segment => (segment.kind === 'table' ? [segment.table] : []));
}

/** Names that appear more than once in `names` (the set of duplicated values). */
function duplicates(names: string[]): Set<string> {
	const seen = new Set<string>();
	const dupes = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			dupes.add(name);
		}
		seen.add(name);
	}
	return dupes;
}

/** All ways `table` would produce invalid SDL, in document order. */
export function validateTable(table: TableModel, duplicateTableNames: Set<string>): SchemaValidationError[] {
	const errors: SchemaValidationError[] = [];
	const base = { tableId: table.id, tableName: table.typeName };

	if (!isValidGraphqlName(table.typeName)) {
		errors.push({ ...base, code: 'INVALID_TABLE_NAME', message: GRAPHQL_NAME_HINT });
	} else if (duplicateTableNames.has(table.typeName)) {
		errors.push({
			...base,
			code: 'DUPLICATE_TABLE_NAME',
			message: `Another table is already named “${table.typeName}”.`,
		});
	}

	// Only named fields are emitted; a table with none serializes to `type X { }`,
	// which is a GraphQL syntax error.
	const namedFields = table.fields.filter(field => field.name.trim() !== '');
	if (namedFields.length === 0) {
		errors.push({ ...base, code: 'NO_FIELDS', message: 'A table needs at least one field.' });
	}

	const duplicateFieldNames = duplicates(namedFields.map(field => field.name));
	for (const field of table.fields) {
		if (field.name.trim() === '') {
			continue; // unnamed fields are dropped on serialize, not invalid
		}
		const anchor = { ...base, fieldKey: field.key, fieldName: field.name };
		if (!isValidGraphqlName(field.name)) {
			errors.push({ ...anchor, code: 'INVALID_FIELD_NAME', message: GRAPHQL_NAME_HINT });
		} else if (duplicateFieldNames.has(field.name)) {
			errors.push({
				...anchor,
				code: 'DUPLICATE_FIELD_NAME',
				message: `Another field is already named “${field.name}”.`,
			});
		}
	}

	return errors;
}

/** Every invalid-file-state error across the document's editable tables. */
export function validateSchema(doc: SchemaDocument): SchemaValidationError[] {
	const emitted = tablesOf(doc).filter(table => table.typeName.trim() !== '');
	const duplicateTableNames = duplicates(emitted.map(table => table.typeName));
	return emitted.flatMap(table => validateTable(table, duplicateTableNames));
}
