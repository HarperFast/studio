import { describe, expect, it } from 'vitest';
import { createTable } from './mutations';
import { parseSchema } from './parseSchema';
import { serializeSchema } from './serializeSchema';
import { SchemaDocument, Segment, TableModel } from './types';

function parse(source: string): SchemaDocument {
	return parseSchema(source).document;
}

function firstTable(doc: SchemaDocument): TableModel {
	const segment = doc.segments.find(s => s.kind === 'table');
	if (segment?.kind !== 'table') {
		throw new Error('no table');
	}
	return segment.table;
}

describe('serializeSchema skips unnamed (in-progress) tables', () => {
	// Mimic what the reducer's addTable appends: a blank-name table wrapped in
	// whitespace-only separator segments.
	function withAppendedBlankTable(source: string): SchemaDocument {
		const doc = parse(source);
		const blank: Segment = { kind: 'table', table: createTable('new-0') };
		return {
			...doc,
			segments: [...doc.segments, { kind: 'raw', text: '\n' }, blank, { kind: 'raw', text: '\n' }],
		};
	}

	it('adds nothing to the file until the table is named', () => {
		const source = 'type Dog @table {\n\tid: ID @primaryKey\n}\n';
		expect(serializeSchema(withAppendedBlankTable(source))).toBe(source);
	});

	it('adds nothing to an empty file until the table is named', () => {
		expect(serializeSchema(withAppendedBlankTable(''))).toBe('');
	});

	it('emits the table once it has a name', () => {
		const doc = withAppendedBlankTable('type Dog @table {\n\tid: ID @primaryKey\n}\n');
		const named = {
			...doc,
			segments: doc.segments.map(segment =>
				segment.kind === 'table' && segment.table.typeName === ''
					? { kind: 'table' as const, table: { ...segment.table, typeName: 'Cat' } }
					: segment
			),
		};
		expect(serializeSchema(named)).toContain('type Cat @table @export @sealed {');
	});
});

describe('serializeSchema alphabetical ordering', () => {
	it('sorts unedited table blocks alphabetically, verbatim, keeping raw gaps anchored', () => {
		const doc = parse('type Zebra @table {\n\tid: ID @primaryKey\n}\ntype Apple @table {\n\tid: ID @primaryKey\n}\n');
		expect(serializeSchema(doc)).toBe(
			'type Apple @table {\n\tid: ID @primaryKey\n}\ntype Zebra @table {\n\tid: ID @primaryKey\n}\n',
		);
	});

	it("keeps a table's attached leading comment traveling with it when sorting", () => {
		const doc = parse(
			'# zebra comment\ntype Zebra @table {\n\tid: ID\n}\n# apple comment\ntype Apple @table {\n\tid: ID\n}\n',
		);
		expect(serializeSchema(doc)).toBe(
			'# apple comment\ntype Apple @table {\n\tid: ID\n}\n# zebra comment\ntype Zebra @table {\n\tid: ID\n}\n',
		);
	});
});

describe('serializeSchema canonical generation for edited tables', () => {
	it('regenerates directives and args in canonical order, preserving unknown ones', () => {
		const doc = parse(
			'type Dog @weird @sealed @table(randomAccessFields: true, database: "pets") {\n\tid: ID @primaryKey\n}\n',
		);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(
			'type Dog @table(database: "pets", randomAccessFields: true) @sealed @weird {\n\tid: ID @primaryKey\n}\n',
		);
	});

	it("uses the document's detected space indentation when regenerating", () => {
		const doc = parse('type Dog @table {\n  id: ID @primaryKey\n  age: Int\n}\n');
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe('type Dog @table {\n  id: ID @primaryKey\n  age: Int\n}\n');
	});

	it('regenerates list/non-null field types and field leading comments', () => {
		const doc = parse('type Dog @table {\n\t# the vector\n\tvec: [Float!]! @indexed(type: "HNSW")\n}\n');
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(
			'type Dog @table {\n\t# the vector\n\tvec: [Float!]! @indexed(type: "HNSW")\n}\n',
		);
	});

	it('drops empty parens on a regenerated argless directive', () => {
		const doc = parse('type Dog @table() {\n\tid: ID @primaryKey\n}\n');
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe('type Dog @table {\n\tid: ID @primaryKey\n}\n');
	});

	it('re-parsing generated output is stable (idempotent)', () => {
		const doc = parse(
			'type Dog @table(database: "pets") @export {\n\tid: ID @primaryKey\n\tname: String @indexed\n}\n',
		);
		firstTable(doc).edited = true;
		const once = serializeSchema(doc);
		const twiceDoc = parse(once);
		firstTable(twiceDoc).edited = true;
		expect(serializeSchema(twiceDoc)).toBe(once);
	});
});
