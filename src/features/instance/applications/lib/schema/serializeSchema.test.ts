import { describe, expect, it } from 'vitest';
import { createField, createTable } from './mutations';
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
	it('leaves an unsorted file untouched until something is edited (so opening never dirties it)', () => {
		const source = 'type Zebra @table {\n\tid: ID @primaryKey\n}\ntype Apple @table {\n\tid: ID @primaryKey\n}\n';
		expect(serializeSchema(parse(source))).toBe(source);
	});

	it('sorts table blocks alphabetically once any table is edited, keeping raw gaps anchored', () => {
		const doc = parse('type Zebra @table {\n\tid: ID @primaryKey\n}\ntype Apple @table {\n\tid: ID @primaryKey\n}\n');
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(
			'type Apple @table {\n\tid: ID @primaryKey\n}\ntype Zebra @table {\n\tid: ID @primaryKey\n}\n',
		);
	});

	it("keeps a table's attached leading comment traveling with it when sorting", () => {
		const doc = parse(
			'# zebra comment\ntype Zebra @table {\n\tid: ID\n}\n# apple comment\ntype Apple @table {\n\tid: ID\n}\n',
		);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(
			'# apple comment\ntype Apple @table {\n\tid: ID\n}\n# zebra comment\ntype Zebra @table {\n\tid: ID\n}\n',
		);
	});
});

describe('serializeSchema description (""") handling', () => {
	it("does not compound a multi-line field description's indentation when its table is edited", () => {
		const source = 'type Dog @table {\n\t"""\n\tThe display name.\n\tShown in lists.\n\t"""\n\tname: String\n}\n';
		const doc = parse(source);
		firstTable(doc).edited = true;
		const once = serializeSchema(doc);
		expect(once).toBe(source);
		// Editing again (re-parse → re-edit) must stay stable, not add indentation.
		const twice = parse(once);
		firstTable(twice).edited = true;
		expect(serializeSchema(twice)).toBe(source);
	});

	it("keeps a table's leading description with it when tables are sorted", () => {
		const doc = parse(
			'"""\nZebra table.\n"""\ntype Zebra @table {\n\tid: ID\n}\n"""\nApple table.\n"""\ntype Apple @table {\n\tid: ID\n}\n',
		);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(
			'"""\nApple table.\n"""\ntype Apple @table {\n\tid: ID\n}\n"""\nZebra table.\n"""\ntype Zebra @table {\n\tid: ID\n}\n',
		);
	});
});

describe('serializeSchema preserves in-body comments when a table is edited', () => {
	it('keeps a comment trailing the last field instead of dropping it on edit', () => {
		const source = 'type Dog @table {\n\tid: ID @primaryKey\n\t# trailing note about the table\n}\n';
		const doc = parse(source);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(source);
	});

	it('keeps a header-line comment on the header line instead of relocating it on edit', () => {
		const source = 'type Dog @table { # the dogs table\n\tid: ID @primaryKey\n}\n';
		const doc = parse(source);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toBe(source);
	});

	it('preserves a comments-only table body on edit (does not silently drop the comment)', () => {
		const source = 'type Dog @table {\n\t# just a note, no fields yet\n}\n';
		const doc = parse(source);
		firstTable(doc).edited = true;
		expect(serializeSchema(doc)).toContain('# just a note, no fields yet');
	});

	it('re-editing a table with a trailing multi-line description block stays idempotent', () => {
		const source = 'type Dog @table {\n\tid: ID @primaryKey\n\t"""\n\tA trailing note.\n\tOn two lines.\n\t"""\n}\n';
		const doc = parse(source);
		firstTable(doc).edited = true;
		const once = serializeSchema(doc);
		expect(once).toBe(source);
		const twice = parse(once);
		firstTable(twice).edited = true;
		expect(serializeSchema(twice)).toBe(source);
	});

	it('keeps header and trailing comments anchored through a field rename and a table rename', () => {
		// The design keys these comments to the table object, not to a field or a
		// position — so renaming either must not strand or relocate them.
		const source = 'type Dog @table { # the dogs table\n\tid: ID @primaryKey\n\t# trailing note\n}\n';
		const doc = parse(source);
		const table = firstTable(doc);
		table.edited = true;
		table.typeName = 'Canine';
		table.fields[0] = { ...table.fields[0], name: 'identifier' };
		expect(serializeSchema(doc)).toBe(
			'type Canine @table { # the dogs table\n\tidentifier: ID @primaryKey\n\t# trailing note\n}\n',
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

	it('skips an unnamed (in-progress) field until it is named', () => {
		const doc = parse('type Dog @table {\n\tid: ID @primaryKey\n}\n');
		const table = firstTable(doc);
		table.edited = true;
		table.fields.push(createField());
		expect(serializeSchema(doc)).toBe('type Dog @table {\n\tid: ID @primaryKey\n}\n');

		table.fields[table.fields.length - 1].name = 'age';
		table.fields[table.fields.length - 1].type = { kind: 'named', name: 'Int', nonNull: false };
		expect(serializeSchema(doc)).toBe('type Dog @table {\n\tid: ID @primaryKey\n\tage: Int\n}\n');
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
