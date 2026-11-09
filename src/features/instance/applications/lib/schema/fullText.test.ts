import { describe, expect, it } from 'vitest';
import {
	emptyFullTextConfig,
	FullTextConfig,
	fullTextErrors,
	fullTextIndexChanges,
	fullTextSourceCandidates,
	fullTextSourceKind,
	newFullTextSource,
	readFullTextConfig,
	writeFullTextConfig,
} from './fullText';
import { parseSchema } from './parseSchema';
import { SchemaDocument, TableModel } from './types';

/** Harper's own docs example (`resources/FULL_TEXT.md`, v5.3.6), laid out the way the docs lay it out. */
const DOCS_SCHEMA = `type Product @table(audit: true) @export {
	id: ID @primaryKey
	title: String
	description: String
	tags: [String]
	manual: Blob
	summary: String @computed(from: "title")
	catalogSearch: FullText
		@fullText(
			fields: [{ name: "title", weight: 3, highlight: true }, { name: "description" }, { name: "tags" }]
			highlighting: { maxFragments: 2, fragmentLength: 120 }
		)
}
`;

function doc(source: string): SchemaDocument {
	const parsed = parseSchema(source);
	expect(parsed.ok).toBe(true);
	return parsed.document;
}

function firstTable(source: string): TableModel {
	return doc(source).segments.flatMap(segment => (segment.kind === 'table' ? [segment.table] : []))[0];
}

function field(table: TableModel, name: string) {
	return table.fields.find(candidate => candidate.name === name)!;
}

/** The docs table with `catalogSearch`'s @fullText arguments replaced. */
function withArgs(args: string): TableModel {
	return firstTable(DOCS_SCHEMA.replace(/@fullText\([\s\S]*?\n\t\t\)/, `@fullText(${args})`));
}

function errorsFor(args: string): string[] {
	const table = withArgs(args);
	return fullTextErrors(field(table, 'catalogSearch'), table);
}

describe('readFullTextConfig', () => {
	it('reads the docs example', () => {
		const table = firstTable(DOCS_SCHEMA);
		expect(readFullTextConfig(field(table, 'catalogSearch'))).toEqual({
			fields: [{ name: 'title', weight: 3, highlight: true }, { name: 'description' }, { name: 'tags' }],
			analyzer: undefined,
			stopWords: undefined,
			positions: undefined,
			surfaceTerms: undefined,
			synonyms: [],
			highlighting: { maxFragments: 2, fragmentLength: 120 },
		});
	});

	it('reads every option', () => {
		const table = withArgs(
			'fields: [{ name: "manual", mediaType: "text/plain" }], analyzer: "english@2", stopWords: false, positions: true, surfaceTerms: false, synonyms: [{ source: "shoe", replacements: ["trainer"] }]',
		);
		expect(readFullTextConfig(field(table, 'catalogSearch'))).toEqual({
			fields: [{ name: 'manual', mediaType: 'text/plain' }],
			analyzer: 'english@2',
			stopWords: false,
			positions: true,
			surfaceTerms: false,
			synonyms: [{ source: 'shoe', replacements: ['trainer'] }],
			highlighting: undefined,
		});
	});

	it('is undefined for anything it can’t show faithfully, so the editor leaves it alone', () => {
		for (
			const args of [
				'fields: [{ name: "title", boost: 2 }]', // an option Harper doesn't define
				'fields: { name: "title" }', // not a list: Harper refuses it rather than coercing
				'fields: [{ name: "title" }], name: "x"', // `name` is the field's, not an argument
				'fields: [{ name: "title" }], stopWords: maybe',
				'fields: [{ name: "title", weight: "3" }]',
				'fields: [{ name: "title" }], highlighting: true',
			]
		) {
			expect(readFullTextConfig(field(withArgs(args), 'catalogSearch')), args).toBeUndefined();
		}
	});

	it('is undefined for a field without @fullText', () => {
		expect(readFullTextConfig(field(firstTable(DOCS_SCHEMA), 'title'))).toBeUndefined();
	});
});

describe('writeFullTextConfig', () => {
	it('writes back exactly what it read', () => {
		const catalogSearch = field(firstTable(DOCS_SCHEMA), 'catalogSearch');
		const written = writeFullTextConfig(catalogSearch.directives, readFullTextConfig(catalogSearch)!);
		expect(readFullTextConfig({ ...catalogSearch, directives: written })).toEqual(readFullTextConfig(catalogSearch));
		expect(written[0].args.map(arg => arg.name)).toEqual(['fields', 'highlighting']);
	});

	it('leaves unset options out rather than writing their defaults', () => {
		const written = writeFullTextConfig([], { ...emptyFullTextConfig(), fields: [{ name: 'title' }] });
		expect(written).toEqual([{
			name: 'fullText',
			hadParens: false,
			args: [{ name: 'fields', value: '[{ name: "title" }]' }],
		}]);
	});

	it('turns highlighting on with Harper’s defaults as an empty object, and off by removing it', () => {
		const on = writeFullTextConfig([], { ...emptyFullTextConfig(), fields: [{ name: 'title' }], highlighting: {} });
		expect(on[0].args.find(arg => arg.name === 'highlighting')?.value).toBe('{}');
		const off = writeFullTextConfig(on, { ...emptyFullTextConfig(), fields: [{ name: 'title' }] });
		expect(off[0].args.some(arg => arg.name === 'highlighting')).toBe(false);
	});

	it('drops a number GraphQL can’t write instead of breaking the file', () => {
		const config: FullTextConfig = {
			...emptyFullTextConfig(),
			fields: [{ name: 'title', weight: Number.POSITIVE_INFINITY }],
			highlighting: { maxFragments: Number.POSITIVE_INFINITY },
		};
		const args = writeFullTextConfig([], config)[0].args;
		expect(args.find(arg => arg.name === 'fields')?.value).toBe('[{ name: "title" }]');
		expect(args.find(arg => arg.name === 'highlighting')?.value).toBe('{}');
	});
});

describe('sources', () => {
	it('offers stored String, [String] and Blob fields, never computed ones or other types', () => {
		const table = firstTable(DOCS_SCHEMA);
		expect(fullTextSourceCandidates(table).map(candidate => candidate.name))
			.toEqual(['title', 'description', 'tags', 'manual']);
		expect(fullTextSourceKind(field(table, 'tags'))).toBe('stringList');
		expect(fullTextSourceKind(field(table, 'summary'))).toBeUndefined();
		expect(fullTextSourceKind(field(table, 'id'))).toBeUndefined();
	});

	it('gives a new Blob source the media type Harper requires', () => {
		const table = firstTable(DOCS_SCHEMA);
		expect(newFullTextSource(field(table, 'manual'))).toEqual({ name: 'manual', mediaType: 'text/plain' });
		expect(newFullTextSource(field(table, 'title'))).toEqual({ name: 'title' });
	});
});

describe('fullTextErrors', () => {
	it('accepts the docs example and every valid option', () => {
		expect(fullTextErrors(field(firstTable(DOCS_SCHEMA), 'catalogSearch'), firstTable(DOCS_SCHEMA))).toEqual([]);
		expect(errorsFor(
			'fields: [{ name: "manual", mediaType: "text/plain", highlight: true }, { name: "tags", weight: 0.5 }], analyzer: "english@2", synonyms: [{ source: "shoe", replacements: ["trainer", "sneaker"] }], highlighting: {}',
		)).toEqual([]);
	});

	it('has nothing to say about an ordinary field', () => {
		const table = firstTable(DOCS_SCHEMA);
		expect(fullTextErrors(field(table, 'title'), table)).toEqual([]);
	});

	it.each([
		['fields: []', /at least one source/],
		['fields: [{ name: "title" }, { name: "title" }]', /more than once/],
		['fields: [{ name: "nope" }]', /isn’t a field of this table/],
		['fields: [{ name: "summary" }]', /stored String, \[String\] or Blob/],
		['fields: [{ name: "id" }]', /stored String, \[String\] or Blob/],
		['fields: [{ name: "manual" }]', /needs media type “text\/plain”/],
		['fields: [{ name: "title", mediaType: "text/plain" }]', /Only a Blob source takes a media type/],
		['fields: [{ name: "title", weight: 0 }]', /greater than zero/],
		['fields: [{ name: "title" }], analyzer: "french@1"', /only supported analyzer/],
		['fields: [{ name: "title" }], highlighting: {}', /at least one source with “Highlight” on/],
		[
			'fields: [{ name: "title", highlight: true }], surfaceTerms: false, highlighting: {}',
			/needs surface terms/,
		],
		['fields: [{ name: "title", highlight: true }], highlighting: { maxFragments: 0 }', /whole numbers/],
		['fields: [{ name: "title", highlight: true }], highlighting: { fragmentLength: 1.5 }', /whole numbers/],
		['fields: [{ name: "title" }], synonyms: [{ source: "", replacements: ["a"] }]', /needs a term/],
		['fields: [{ name: "title" }], synonyms: [{ source: "a", replacements: [] }]', /at least one replacement/],
		['fields: [{ name: "title" }], synonyms: [{ source: "a", replacements: ["a"] }]', /with itself/],
		['fields: [{ name: "title" }], synonyms: [{ source: "a", replacements: ["b", "b"] }]', /twice/],
		[
			'fields: [{ name: "title" }], synonyms: [{ source: "a", replacements: ["b", "c"] }, { source: "a", replacements: ["c", "b"] }]',
			/appears twice/,
		],
		['fields: [{ name: "title" }], name: "x"', /no “name” option/],
	])('refuses %s', (args, message) => {
		expect(errorsFor(args).join('\n')).toMatch(message);
	});

	it('refuses the field shapes Harper refuses', () => {
		const table = firstTable(`type T @table {
	id: ID @primaryKey
	title: String
	listed: [FullText] @fullText(fields: [{ name: "title" }])
	required: FullText! @fullText(fields: [{ name: "title" }])
	bare: FullText
	indexed: FullText @indexed @fullText(fields: [{ name: "title" }])
	misplaced: String @fullText(fields: [{ name: "title" }])
}`);
		const messages = (name: string) => fullTextErrors(field(table, name), table).join('\n');
		expect(messages('listed')).toMatch(/can’t be an array/);
		expect(messages('required')).toMatch(/can’t be required/);
		expect(messages('bare')).toMatch(/at least one source/);
		expect(messages('indexed')).toMatch(/can’t use @indexed/);
		expect(messages('misplaced')).toMatch(/only works on a field of type FullText/);
	});
});

describe('fullTextIndexChanges', () => {
	const saved = doc(DOCS_SCHEMA);
	const changed = (from: string, to: string) => fullTextIndexChanges(saved, doc(DOCS_SCHEMA.replace(from, to)));

	it('says nothing when weights or highlighting change, which Harper applies without a rebuild', () => {
		expect(changed('weight: 3', 'weight: 5')).toEqual([]);
		expect(changed('{ maxFragments: 2, fragmentLength: 120 }', '{ maxFragments: 4 }')).toEqual([]);
		expect(changed('highlight: true', 'highlight: false')).toEqual([]);
		expect(fullTextIndexChanges(saved, saved)).toEqual([]);
	});

	it('flags a rebuild when the stored index changes', () => {
		const rebuild = [{ tableName: 'Product', indexName: 'catalogSearch', kind: 'rebuild' }];
		// Reordering the sources rebuilds, as Harper's docs warn.
		expect(changed('{ name: "description" }, { name: "tags" }', '{ name: "tags" }, { name: "description" }'))
			.toEqual(rebuild);
		expect(changed(', { name: "tags" }]', ']')).toEqual(rebuild);
		expect(changed('highlighting:', 'stopWords: false\n\t\t\thighlighting:')).toEqual(rebuild);
		expect(changed('highlighting:', 'synonyms: [{ source: "shoe", replacements: ["trainer"] }]\n\t\t\thighlighting:'))
			.toEqual(rebuild);
	});

	it('treats an option written out at its default as no change', () => {
		expect(changed('highlighting:', 'positions: true\n\t\t\tanalyzer: "english@2"\n\t\t\thighlighting:')).toEqual([]);
	});

	it('calls a new or renamed index a build, since Harper gives it a new identity', () => {
		expect(changed('catalogSearch:', 'productSearch:'))
			.toEqual([{ tableName: 'Product', indexName: 'productSearch', kind: 'build' }]);
		expect(changed('@table(audit: true)', '@table(audit: true, database: "shop")'))
			.toEqual([{ tableName: 'Product', indexName: 'catalogSearch', kind: 'build' }]);
	});

	it('assumes a rebuild when it can’t read one side and the arguments differ', () => {
		expect(changed('{ name: "tags" }]', '{ name: "tags", boost: 2 }]'))
			.toEqual([{ tableName: 'Product', indexName: 'catalogSearch', kind: 'rebuild' }]);
	});
});

describe('comments inside @fullText', () => {
	it('leaves a commented declaration read-only, since rewriting it would drop the comments', () => {
		for (
			const args of [
				'fields: [{ name: "title" } # the headline\n]',
				'# sources first\nfields: [{ name: "title" }]',
			]
		) {
			expect(readFullTextConfig(field(withArgs(args), 'catalogSearch')), args).toBeUndefined();
		}
	});

	it('doesn’t mistake a # inside a string for a comment', () => {
		const table = withArgs('fields: [{ name: "title" }], synonyms: [{ source: "c#", replacements: ["csharp"] }]');
		expect(readFullTextConfig(field(table, 'catalogSearch'))?.synonyms).toEqual([{
			source: 'c#',
			replacements: ['csharp'],
		}]);
	});
});

describe('validating a commented declaration', () => {
	it('still checks its sources, since an edit elsewhere can break one', () => {
		const table = withArgs('# storefront\nfields: [{ name: "gone" }]');
		expect(readFullTextConfig(field(table, 'catalogSearch'))).toBeUndefined();
		expect(fullTextErrors(field(table, 'catalogSearch'), table).join('\n')).toMatch(/isn’t a field of this table/);
	});
});
