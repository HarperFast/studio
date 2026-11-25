import { describe, expect, it } from 'vitest';
import { createField, createTable, setArg } from './mutations';
import { parseSchema } from './parseSchema';
import { serializeSchema } from './serializeSchema';
import { FieldModel, SchemaDocument, Segment, TableModel } from './types';

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

	function editTwice(source: string): { once: string; twice: string } {
		const doc = parse(source);
		firstTable(doc).edited = true;
		const once = serializeSchema(doc);
		const reparsed = parse(once);
		firstTable(reparsed).edited = true;
		return { once, twice: serializeSchema(reparsed) };
	}

	it("keeps a field description's interior indentation relative to its own margin", () => {
		const source = 'type Dog @table {\n'
			+ '\t"""\n'
			+ '\tThe display name.\n'
			+ '\t  - shown in lists\n'
			+ '\t    - truncated past 40 chars\n'
			+ '\n'
			+ '\t\tcode sample\n'
			+ '\t"""\n'
			+ '\tname: String\n'
			+ '}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe(source);
		expect(twice).toBe(source);
	});

	it("keeps a trailing description's interior indentation relative to its own margin", () => {
		const source = 'type Dog @table {\n\tid: ID @primaryKey\n\t"""\n\tNotes:\n\t  - first\n\t    - nested\n\t"""\n}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe(source);
		expect(twice).toBe(source);
	});

	it('keeps relative indentation in a CRLF document without leaking carriage returns', () => {
		const source = [
			'type Dog @table {',
			'\t"""',
			'\tThe display name.',
			'\t  - shown in lists',
			'\t\t',
			'\t    - truncated past 40 chars',
			'\t"""',
			'\tname: String',
			'}',
			'',
		].join('\r\n');
		const { once, twice } = editTwice(source);
		expect(once).toBe(source.replace('\t\t\r\n', '\r\n'));
		expect(twice).toBe(once);
	});

	it('keeps relative indentation in a space-indented document', () => {
		const source = 'type Dog @table {\n  """\n  Item:\n    - nested\n  """\n  name: String\n}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe(source);
		expect(twice).toBe(source);
	});

	it('moves a description whose content sits off the margin onto the canonical indent, delimiters included', () => {
		const source = 'type Dog @table {\n\t"""\nTop level.\n  - nested\n\t"""\n\tname: String\n}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe('type Dog @table {\n\t"""\n\tTop level.\n\t  - nested\n\t"""\n\tname: String\n}\n');
		expect(twice).toBe(once);
	});

	it('pulls uniformly over-indented description content back to the canonical indent', () => {
		const source = 'type Dog @table {\n\t"""\n\t\t\tTop level.\n\t\t\t  - nested\n\t"""\n\tname: String\n}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe('type Dog @table {\n\t"""\n\tTop level.\n\t  - nested\n\t"""\n\tname: String\n}\n');
		expect(twice).toBe(once);
	});

	it('strips only the literal common prefix when tabs and spaces are mixed', () => {
		const source = 'type Dog @table {\n\t"""\n\t  two spaces\n\t\ttab\n\t"""\n\tname: String\n}\n';
		const { once, twice } = editTwice(source);
		expect(once).toBe(source);
		expect(twice).toBe(source);
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

describe('full-text fields', () => {
	// Harper's docs put a long `@fullText(...)` on the lines below its field.
	const DOCS_LAYOUT = [
		'type Product @table(audit: true) @export {',
		'\tid: ID @primaryKey',
		'\ttitle: String',
		'\tcatalogSearch: FullText',
		'\t\t@fullText(',
		'\t\t\tfields: [{ name: "title", weight: 3, highlight: true }]',
		'\t\t\thighlighting: { maxFragments: 2, fragmentLength: 120 }',
		'\t\t) # the storefront search',
		'\tprice: Float',
		'}',
		'',
	].join('\n');

	it('reads directives that continue onto the lines below their field', () => {
		const parsed = parseSchema(DOCS_LAYOUT);
		expect(parsed.ok).toBe(true);
		const table = firstTable(parsed.document);
		expect(table.fields.map(field => field.name)).toEqual(['id', 'title', 'catalogSearch', 'price']);
		const catalogSearch = table.fields[2];
		expect(catalogSearch.directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(catalogSearch.directives[0].args.map(arg => arg.name)).toEqual(['fields', 'highlighting']);
		expect(catalogSearch.lineComment).toBe('# the storefront search');
		expect(serializeSchema(parsed.document)).toBe(DOCS_LAYOUT);
	});

	it('keeps a comment after the field line from swallowing the next field', () => {
		const source = 'type T @table {\n\tid: ID @primaryKey # key\n\tname: String\n}\n';
		const table = firstTable(parse(source));
		expect(table.fields.map(field => [field.name, field.lineComment])).toEqual([['id', '# key'], ['name', undefined]]);
	});

	it('writes an edited @fullText as a block below its field, and reads it back the same', () => {
		const doc = parse(DOCS_LAYOUT);
		const table = firstTable(doc);
		const edited: SchemaDocument = {
			...doc,
			segments: doc.segments.map(segment =>
				segment.kind === 'table' ? { kind: 'table', table: { ...table, edited: true } } : segment
			),
		};
		const written = serializeSchema(edited);
		expect(written).toBe(DOCS_LAYOUT);
		expect(serializeSchema(parse(written))).toBe(written);
	});

	it('writes other directives on the field line and a line comment after the block', () => {
		const table = { ...createTable('t'), typeName: 'T' };
		table.fields = [
			table.fields[0],
			{
				...createField('search'),
				type: { kind: 'named', name: 'FullText', nonNull: false },
				lineComment: '# note',
				directives: [
					{ name: 'fullText', hadParens: true, args: [{ name: 'fields', value: '[{ name: "id" }]' }] },
					{ name: 'deprecated', hadParens: false, args: [] },
				],
			},
		];
		const written = serializeSchema({ segments: [{ kind: 'table', table }], indent: '  ', newline: '\n' });
		expect(written).toBe([
			'type T @table @export @sealed {',
			'  id: ID @primaryKey',
			'  search: FullText @deprecated',
			'    @fullText(',
			'      fields: [{ name: "id" }]',
			'    ) # note',
			'}',
		].join('\n'));
		const reread = firstTable(parse(written)).fields[1];
		expect(reread.directives.map(directive => directive.name)).toEqual(['deprecated', 'fullText']);
		expect(reread.lineComment).toBe('# note');
	});
});

describe('a comment between a field and its continued directive', () => {
	/** Marks the table edited, so it is regenerated. */
	function regenerate(source: string, change: (table: TableModel) => TableModel = table => table): string {
		const doc = parse(source);
		return serializeSchema({
			...doc,
			segments: doc.segments.map(segment =>
				segment.kind === 'table' ? { kind: 'table', table: { ...change(segment.table), edited: true } } : segment
			),
		});
	}

	function fieldNamed(source: string, name: string): FieldModel {
		const field = firstTable(parse(source)).fields.find(candidate => candidate.name === name);
		if (!field) {
			throw new Error(`no field ${name}`);
		}
		return field;
	}

	const tableLines = (fieldLines: string[]) => ['type T @table {', '\tid: ID @primaryKey', ...fieldLines, '}', ''];

	const CANONICAL = tableLines([
		'\tsearch: FullText',
		'\t\t# searches the id',
		'\t\t@fullText(',
		'\t\t\tfields: [{ name: "id" }]',
		'\t\t) # the storefront search',
		'\tprice: Float',
	]);

	it('reads the comment into the field, which makes the table editable', () => {
		const source = [
			'type Product @table(audit: true) {',
			'\tid: ID @primaryKey',
			'\ttitle: String',
			'\tcatalogSearch: FullText',
			'\t\t# searches the title',
			'\t\t@fullText(fields: [{ name: "title" }])',
			'}',
			'',
		].join('\n');
		const parsed = parseSchema(source);
		const table = firstTable(parsed.document);
		expect(table.fields.map(field => field.name)).toEqual(['id', 'title', 'catalogSearch']);
		expect(table.fields[2].continuationComments).toEqual(['# searches the title']);
		expect(table.fields[2].directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(serializeSchema(parsed.document)).toBe(source);
		expect(regenerate(source)).toBe(source.replace(
			'\t\t@fullText(fields: [{ name: "title" }])',
			'\t\t@fullText(\n\t\t\tfields: [{ name: "title" }]\n\t\t)',
		));
	});

	it('writes the comment back in its place when the table is regenerated', () => {
		const source = CANONICAL.join('\n');
		expect(fieldNamed(source, 'search').continuationComments).toEqual(['# searches the id']);
		const once = regenerate(source);
		expect(once).toBe(source);
		expect(regenerate(once)).toBe(source);
	});

	it('keeps the comment when the directive under it is edited', () => {
		const written = regenerate(CANONICAL.join('\n'), table => ({
			...table,
			fields: table.fields.map(field =>
				field.name === 'search'
					? { ...field, directives: setArg(field.directives, 'fullText', 'stopWords', 'false') }
					: field
			),
		}));
		expect(written).toContain('\tsearch: FullText\n\t\t# searches the id\n\t\t@fullText(\n');
		expect(written).toContain('\t\t\tstopWords: false\n\t\t) # the storefront search\n');
	});

	it('keeps several comment lines in order, reading no directive out of them', () => {
		const source = tableLines([
			'\tsearch: FullText',
			'\t\t# searches the id',
			'\t\t# no @indexed here: Harper refuses one on a FullText field',
			'\t\t@fullText(',
			'\t\t\tfields: [{ name: "id" }]',
			'\t\t)',
		]).join('\n');
		const search = fieldNamed(source, 'search');
		expect(search.continuationComments).toEqual([
			'# searches the id',
			'# no @indexed here: Harper refuses one on a FullText field',
		]);
		expect(search.directives.map(directive => directive.name)).toEqual(['fullText']);
		expect(regenerate(source)).toBe(source);
	});

	it('drops blank lines in the gap, as it already did with no comment there', () => {
		const block = ['\t\t@fullText(', '\t\t\tfields: [{ name: "id" }]', '\t\t)'];
		const blankOnly = tableLines(['\tsearch: FullText', '', ...block]).join('\n');
		expect(regenerate(blankOnly)).toBe(tableLines(['\tsearch: FullText', ...block]).join('\n'));

		const commented = tableLines(['\tsearch: FullText', '', '\t\t# one', '', '\t\t# two', '', ...block]).join('\n');
		expect(regenerate(commented)).toBe(
			tableLines(['\tsearch: FullText', '\t\t# one', '\t\t# two', ...block]).join('\n'),
		);
	});

	it("puts the field's other directives below the comment too, and its line comment after them", () => {
		const source = tableLines([
			'\t# the lookup key',
			'\tname: String',
			'\t\t# looked up by name',
			'\t\t@indexed # unique per tenant',
		]).join('\n');
		expect(fieldNamed(source, 'name')).toMatchObject({
			leadingComments: ['# the lookup key'],
			continuationComments: ['# looked up by name'],
			lineComment: '# unique per tenant',
		});
		expect(regenerate(source)).toBe(source);
	});

	it('leaves a comment with no directive after it to the next field or the table, as before', () => {
		const source = tableLines(['\ttitle: String', '\t\t# about price', '\tprice: Float', '\t\t# the end']).join('\n');
		const table = firstTable(parse(source));
		expect(table.fields.map(field => [field.name, field.continuationComments, field.leadingComments])).toEqual([
			['id', undefined, []],
			['title', undefined, []],
			['price', undefined, ['# about price']],
		]);
		expect(table.trailingComments).toEqual(['# the end']);
	});

	it('moves the comment above its field once no directive is left below it', () => {
		const written = regenerate(CANONICAL.join('\n'), table => ({
			...table,
			fields: table.fields.map(field =>
				field.name === 'search'
					? { ...field, type: { kind: 'named', name: 'String', nonNull: false }, directives: [] }
					: field
			),
		}));
		expect(written).toBe(
			tableLines([
				'\t# searches the id',
				'\tsearch: String # the storefront search',
				'\tprice: Float',
			]).join('\n'),
		);
		expect(fieldNamed(written, 'search').leadingComments).toEqual(['# searches the id']);
	});

	it('reads and writes the comments in a CRLF document without carrying a carriage return', () => {
		const source = tableLines([
			'\tsearch: FullText',
			'\t\t# searches the id',
			'',
			'\t\t# and nothing else yet',
			'\t\t@fullText(',
			'\t\t\tfields: [{ name: "id" }]',
			'\t\t)',
		]).join('\r\n');
		expect(fieldNamed(source, 'search').continuationComments).toEqual([
			'# searches the id',
			'# and nothing else yet',
		]);
		expect(regenerate(source)).toBe(source.replace('\r\n\r\n', '\r\n'));
	});

	it.each([
		['on the field line', ['\tsearch: FullText # searches the id', '\t\t@fullText(fields: [{ name: "id" }])']],
		['after a directive in the run', ['\tname: String @indexed', '\t\t# the owner', '\t\t@relationship(from: "id")']],
	])('still keeps the table as text for a comment %s, which the model has no place for', (_, fieldLines) => {
		const source = tableLines(fieldLines).join('\n');
		const parsed = parseSchema(source);
		expect(parsed.document.segments.some(segment => segment.kind === 'table')).toBe(false);
		expect(serializeSchema(parsed.document)).toBe(source);
	});
});

describe('directives with comments inside their arguments', () => {
	const source = [
		'type Product @table(audit: true) {',
		'\tid: ID @primaryKey',
		'\ttitle: String',
		'\tcatalogSearch: FullText',
		'\t\t@fullText(',
		'\t\t\t# the storefront search',
		'\t\t\tfields: [{ name: "title" }] # just the title for now',
		'\t\t)',
		'}',
		'',
	].join('\n');

	function edited(change: (table: TableModel) => TableModel): string {
		const doc = parse(source);
		return serializeSchema({
			...doc,
			segments: doc.segments.map(segment =>
				segment.kind === 'table' ? { kind: 'table', table: { ...change(segment.table), edited: true } } : segment
			),
		});
	}

	it('keeps the comments when something else in the table changes', () => {
		const written = edited(table => ({
			...table,
			fields: [...table.fields, { ...createField('price'), type: { kind: 'named', name: 'Float', nonNull: false } }],
		}));
		expect(written).toContain(
			'\t\t@fullText(\n\t\t\t# the storefront search\n\t\t\tfields: [{ name: "title" }] # just the title for now\n\t\t)',
		);
		expect(written).toContain('\tprice: Float');
	});

	it('regenerates the arguments once one of them changes, which is why the editor keeps them read-only', () => {
		const written = edited(table => ({
			...table,
			fields: table.fields.map(field =>
				field.name === 'catalogSearch'
					? { ...field, directives: setArg(field.directives, 'fullText', 'stopWords', 'false') }
					: field
			),
		}));
		expect(written).not.toContain('# the storefront search');
		expect(written).toContain('\t\t\tstopWords: false');
	});
});
