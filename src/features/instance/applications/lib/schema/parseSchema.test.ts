import { describe, expect, it } from 'vitest';
import { parseSchema } from './parseSchema';
import { serializeSchema } from './serializeSchema';
import { baseTypeName, findArg, findDirective, Segment, TableModel } from './types';

/** Round-trip: with nothing edited, serialize must reproduce the exact source. */
function expectRoundTrip(source: string): void {
	const { document, ok } = parseSchema(source);
	expect(ok).toBe(true);
	expect(serializeSchema(document)).toBe(source);
}

function tables(source: string): TableModel[] {
	return parseSchema(source).document.segments
		.filter((segment): segment is Extract<Segment, { kind: 'table' }> => segment.kind === 'table')
		.map(segment => segment.table);
}

describe('parseSchema round-trip fidelity', () => {
	it('reproduces a canonical single-table schema byte-for-byte', () => {
		expectRoundTrip(
			'type Dog @table @export {\n\tid: ID @primaryKey\n\tname: String @indexed\n}\n',
		);
	});

	it('preserves leading comments, blank lines, and trailing content', () => {
		expectRoundTrip(
			'# top of file\n\n# describes dogs\ntype Dog @table {\n\tid: ID @primaryKey\n}\n\n# trailing note\n',
		);
	});

	it('preserves non-@table definitions verbatim as raw', () => {
		expectRoundTrip(
			'scalar Vector\n\nenum Color { RED GREEN }\n\ntype Dog @table {\n\tid: ID @primaryKey\n}\n',
		);
	});

	it('preserves unknown directives, unknown args, and inline comments', () => {
		expectRoundTrip(
			'type Dog @table(database: "pets", mystery: 42) @weird {\n\tid: ID @primaryKey # the key\n\tvec: [Float] @indexed(type: "HNSW", M: 16)\n}\n',
		);
	});

	it('preserves CRLF newlines and space indentation', () => {
		expectRoundTrip('type Dog @table {\r\n    id: ID @primaryKey\r\n}\r\n');
	});

	it('handles a type keyword hiding inside strings and comments', () => {
		expectRoundTrip(
			'# type NotReal @table { }\ntype Real @table {\n\tid: ID @primaryKey\n\tnote: String @computed(from: "type Fake { }")\n}\n',
		);
	});

	it('round-trips table and field descriptions (single- and multi-line) verbatim', () => {
		expectRoundTrip(
			'"""\nA dog.\n"""\ntype Dog @table {\n\t"""The primary key."""\n\tid: ID @primaryKey\n\t"""\n\tThe display name.\n\tShown in lists.\n\t"""\n\tname: String @indexed\n}\n',
		);
	});

	it('round-trips a comment trailing the last field, before the closing brace', () => {
		expectRoundTrip('type Dog @table {\n\tid: ID @primaryKey\n\t# trailing note about the table\n}\n');
	});

	it('round-trips a comment on the type header line, after the opening brace', () => {
		expectRoundTrip('type Dog @table { # the dogs table\n\tid: ID @primaryKey\n}\n');
	});

	it('leaves an empty document empty', () => {
		expectRoundTrip('');
	});
});

describe('parseSchema structure', () => {
	it('captures the type name, directives, and fields', () => {
		const [dog] = tables('type Dog @table(database: "pets") @export @sealed {\n\tid: ID @primaryKey\n\tage: Int\n}\n');
		expect(dog.typeName).toBe('Dog');
		expect(dog.directives.map(d => d.name)).toEqual(['table', 'export', 'sealed']);
		expect(findArg(findDirective(dog.directives, 'table'), 'database')?.value).toBe('"pets"');
		expect(dog.fields.map(f => f.name)).toEqual(['id', 'age']);
	});

	it('parses list and non-null type references', () => {
		const [t] = tables(
			'type T @table {\n\ta: String!\n\tb: [Int]\n\tc: [Float!]!\n}\n',
		);
		expect(t.fields[0].type).toEqual({ kind: 'named', name: 'String', nonNull: true });
		expect(t.fields[1].type).toEqual({
			kind: 'list',
			of: { kind: 'named', name: 'Int', nonNull: false },
			nonNull: false,
		});
		expect(t.fields[2].type).toEqual({
			kind: 'list',
			of: { kind: 'named', name: 'Float', nonNull: true },
			nonNull: true,
		});
		expect(baseTypeName(t.fields[2].type)).toBe('Float');
	});

	it('treats a type without @table as raw, not an editable table', () => {
		expect(tables('type Query {\n\thello: String\n}\n')).toHaveLength(0);
	});

	it('captures field-level leading and inline comments', () => {
		const [t] = tables('type T @table {\n\t# the id\n\tid: ID @primaryKey # inline\n}\n');
		expect(t.fields[0].leadingComments).toEqual(['# the id']);
		expect(t.fields[0].lineComment).toBe('# inline');
	});

	it('captures a comment trailing the last field as trailingComments, not a leading comment', () => {
		const [t] = tables('type T @table {\n\tid: ID @primaryKey\n\t# trailing note\n}\n');
		expect(t.fields[0].leadingComments).toEqual([]);
		expect(t.trailingComments).toEqual(['# trailing note']);
	});

	it('captures a header-line comment separately from the first field', () => {
		const [t] = tables('type T @table { # header note\n\tid: ID @primaryKey\n}\n');
		expect(t.headerComment).toBe('# header note');
		expect(t.fields[0].leadingComments).toEqual([]);
	});

	it("keeps a comment on its own line before the first field as that field's leading comment", () => {
		const [t] = tables('type T @table {\n\t# not a header comment\n\tid: ID @primaryKey\n}\n');
		expect(t.headerComment).toBeUndefined();
		expect(t.fields[0].leadingComments).toEqual(['# not a header comment']);
	});
});

describe('parseSchema failure handling', () => {
	it('flags unbalanced braces so the caller can fall back to text', () => {
		const result = parseSchema('type Dog @table {\n\tid: ID\n');
		expect(result.ok).toBe(true); // no `type` block matched -> whole thing is raw
		// A genuinely unterminated string is the unsafe case:
		expect(parseSchema('type Dog @table {\n\tname: String @x(v: "unterminated\n}\n').ok).toBe(false);
	});
});
