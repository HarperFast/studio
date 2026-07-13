import { describe, expect, it } from 'vitest';
import { parseSchema } from './parseSchema';
import { SchemaErrorCode, validateSchema } from './validateSchema';

function codesFor(source: string): SchemaErrorCode[] {
	return validateSchema(parseSchema(source).document).map(error => error.code);
}

describe('validateSchema', () => {
	it('accepts a well-formed table', () => {
		expect(codesFor('type Dog @table {\n\tid: ID @primaryKey\n\tname: String\n}\n')).toEqual([]);
	});

	it('flags a named table with no fields (the empty-body / invalid-SDL case)', () => {
		expect(codesFor('type Dog @table {\n\t# just a comment, no fields\n}\n')).toEqual(['NO_FIELDS']);
	});

	it('treats a table whose only field is unnamed as having no fields', () => {
		// A blank-named field is dropped on serialize, so the table would emit `type X { }`.
		const doc = parseSchema('type Dog @table {\n\tid: ID\n}\n').document;
		const table = doc.segments.find(s => s.kind === 'table');
		if (table?.kind !== 'table') { throw new Error('no table'); }
		table.table.fields[0].name = '';
		expect(validateSchema(doc).map(e => e.code)).toEqual(['NO_FIELDS']);
	});

	it('flags an invalid GraphQL type name', () => {
		const doc = parseSchema('type Dog @table {\n\tid: ID\n}\n').document;
		const table = doc.segments.find(s => s.kind === 'table');
		if (table?.kind !== 'table') { throw new Error('no table'); }
		table.table.typeName = 'Bad Name';
		expect(validateSchema(doc).map(e => e.code)).toContain('INVALID_TABLE_NAME');
	});

	it('flags an invalid GraphQL field name', () => {
		// Build the invalid name through the model (a raw `has space:` wouldn't parse).
		const doc = parseSchema('type Dog @table {\n\tid: ID\n}\n').document;
		const table = doc.segments.find(s => s.kind === 'table');
		if (table?.kind !== 'table') { throw new Error('no table'); }
		table.table.fields[0].name = 'has space';
		expect(validateSchema(doc).map(e => e.code)).toContain('INVALID_FIELD_NAME');
	});

	it('flags duplicate table names, once per offending table', () => {
		const codes = codesFor('type Dog @table {\n\tid: ID\n}\ntype Dog @table {\n\tname: String\n}\n');
		expect(codes.filter(c => c === 'DUPLICATE_TABLE_NAME')).toHaveLength(2);
	});

	it('flags duplicate field names within a table', () => {
		const codes = codesFor('type Dog @table {\n\tid: ID\n\tid: String\n}\n');
		expect(codes.filter(c => c === 'DUPLICATE_FIELD_NAME')).toHaveLength(2);
	});

	it('ignores a blank-named (in-progress) table, which the serializer drops anyway', () => {
		const doc = parseSchema('type Dog @table {\n\tid: ID\n}\n').document;
		const table = doc.segments.find(s => s.kind === 'table');
		if (table?.kind !== 'table') { throw new Error('no table'); }
		table.table.typeName = '';
		expect(validateSchema(doc)).toEqual([]);
	});

	it('anchors field errors to the field key for inline highlighting', () => {
		const doc = parseSchema('type Dog @table {\n\tid: ID\n\tname: String\n}\n').document;
		const table = doc.segments.find(s => s.kind === 'table');
		if (table?.kind !== 'table') { throw new Error('no table'); }
		const key = table.table.fields[1].key;
		table.table.fields[1].name = 'bad name';
		const error = validateSchema(doc).find(e => e.code === 'INVALID_FIELD_NAME');
		expect(error?.fieldKey).toBe(key);
		expect(error?.fieldName).toBe('bad name');
	});
});
