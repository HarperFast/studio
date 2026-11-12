import { describe, expect, it } from 'vitest';
import {
	canEmbed,
	decideLeaf,
	decideValues,
	derivedFieldErrors,
	derivedSourceNames,
	graphqlStringValue,
	setDecideValues,
	withDecide,
	withEmbed,
} from './derivedFields';
import { getArgValue, hasDirective } from './mutations';
import { parseSchema } from './parseSchema';
import { serializeSchema } from './serializeSchema';
import { FieldModel, TableModel } from './types';

function tableOf(fields: string): TableModel {
	const segment = parseSchema(`type Ticket @table {\n${fields}\n}\n`).document.segments.find((s) => s.kind === 'table');
	if (segment?.kind !== 'table') {
		throw new Error('no table');
	}
	return segment.table;
}

function fieldOf(table: TableModel, name: string): FieldModel {
	return table.fields.find((field) => field.name === name)!;
}

function errorsFor(fields: string, name: string): string[] {
	const table = tableOf(fields);
	return derivedFieldErrors(fieldOf(table, name), table);
}

const BASE = '\tid: ID @primaryKey\n\tbody: String\n\tscore: Float\n\twhy: String\n';

describe('which fields can carry a directive', () => {
	const table = tableOf(
		`${BASE}\tvector: [Float]\n\tstrict: [Float!]!\n\tnested: [[Float]]\n\twords: [String]\n\tflag: Boolean\n\tcount: Int\n\twhen: Date`,
	);

	it('lets @embed fill only a list of Float', () => {
		const embeddable = table.fields.filter(canEmbed).map((field) => field.name);
		expect(embeddable).toEqual(['vector', 'strict']);
	});

	it('lets @decide fill only a String, Boolean or Int that is not a list', () => {
		const leaves = Object.fromEntries(table.fields.map((field) => [field.name, decideLeaf(field)]));
		expect(leaves).toMatchObject({ body: 'String', flag: 'Boolean', count: 'Int' });
		expect(leaves.words).toBeUndefined();
		expect(leaves.score).toBeUndefined();
		expect(leaves.when).toBeUndefined();
		expect(leaves.id).toBeUndefined();
	});

	it('offers every other named field as the source', () => {
		const blank = { ...fieldOf(table, 'why'), name: ' ' };
		const withBlank = { ...table, fields: [...table.fields, blank] };
		expect(derivedSourceNames(withBlank, fieldOf(table, 'vector'))).not.toContain('vector');
		expect(derivedSourceNames(withBlank, fieldOf(table, 'vector'))).toContain('body');
		expect(derivedSourceNames(withBlank, fieldOf(table, 'vector'))).not.toContain(' ');
	});
});

describe('@embed', () => {
	it('accepts a [Float] field with a source and a model', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: "body", model: "default")`, 'vector')).toEqual([]);
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: "body", model: "m") @indexed(type: "HNSW")`, 'vector'))
			.toEqual([]);
	});

	it('refuses any other type', () => {
		expect(errorsFor(`${BASE}\tvector: Float @embed(source: "body", model: "default")`, 'vector')).toEqual([
			'@embed needs a [Float] field: choose Float and turn on Array.',
		]);
		expect(errorsFor(`${BASE}\tvector: [String] @embed(source: "body", model: "default")`, 'vector')).toHaveLength(1);
	});

	it('needs both a source and a model', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @embed`, 'vector')).toEqual([
			'Choose the field to embed.',
			'Choose the embedding model.',
		]);
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: "", model: "")`, 'vector')).toHaveLength(2);
	});

	it('needs the source to be a field of the table', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: "text", model: "default")`, 'vector')).toEqual([
			'There is no field named "text" to embed.',
		]);
	});

	it('refuses an argument that is not a quoted string', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: body, model: "default")`, 'vector')).toContain(
			'@embed\'s "source" must be a quoted string.',
		);
	});

	it('refuses an index that is not the HNSW one it creates itself', () => {
		const conflict = '@embed indexes the field with HNSW itself: set the index type to HNSW, or turn Indexed off.';
		expect(errorsFor(`${BASE}\tvector: [Float] @indexed @embed(source: "body", model: "m")`, 'vector')).toEqual([
			conflict,
		]);
		expect(errorsFor(`${BASE}\tvector: [Float] @indexed(type: "flat") @embed(source: "body", model: "m")`, 'vector'))
			.toEqual([conflict]);
	});

	it('turning it on makes a plain index the HNSW one, and leaves any other index alone', () => {
		const plain = withEmbed(fieldOf(tableOf(`${BASE}\tvector: [Float] @indexed`), 'vector'), true);
		expect(getArgValue(plain.directives, 'indexed', 'type')).toBe('"HNSW"');
		const typed = withEmbed(fieldOf(tableOf(`${BASE}\tvector: [Float] @indexed(type: "flat")`), 'vector'), true);
		expect(getArgValue(typed.directives, 'indexed', 'type')).toBe('"flat"');
		const none = withEmbed(fieldOf(tableOf(`${BASE}\tvector: [Float]`), 'vector'), true);
		expect(hasDirective(none.directives, 'indexed')).toBe(false);
		expect(hasDirective(withEmbed(none, false).directives, 'embed')).toBe(false);
	});
});

describe('@decide', () => {
	const decide = (type: string, args: string, extra = '') =>
		errorsFor(`${BASE}\tlabel: ${type} @decide(${args})${extra}`, 'label');

	it('accepts each kind of field with what that kind needs', () => {
		expect(decide('String', 'source: "body", values: ["billing", "bug"]')).toEqual([]);
		expect(decide('Boolean', 'source: "body"')).toEqual([]);
		expect(decide('Int', 'source: "body", minimum: 1, maximum: 5')).toEqual([]);
		expect(
			decide(
				'String',
				'source: "body", values: ["a", "b"], model: "route", confidence: "score", decision: "why", instructions: "Be strict."',
			),
		).toEqual([]);
	});

	it('refuses a type that cannot hold a decision', () => {
		const message = "@decide needs a String, Boolean or Int field that isn't an array.";
		expect(decide('Float', 'source: "body"')).toEqual([message]);
		expect(decide('[String]', 'source: "body", values: ["a", "b"]')).toEqual([message]);
	});

	it('needs a source that is another field of the table', () => {
		expect(decide('Boolean', 'model: "route"')).toEqual(['Choose the field to decide from.']);
		expect(decide('Boolean', 'source: "text"')).toEqual(['There is no field named "text" to decide from.']);
		expect(decide('Boolean', 'source: "label"')).toContain(
			'@decide\'s field, "source", "confidence" and "decision" must be different fields.',
		);
	});

	it('needs 2 to 255 different values on a String field, and only there', () => {
		expect(decide('String', 'source: "body"')).toEqual(['List the values the model can choose from.']);
		expect(decide('String', 'source: "body", values: ["only"]')).toEqual(['Give 2 to 255 values to choose from.']);
		expect(decide('String', 'source: "body", values: []')).toEqual(['Give 2 to 255 values to choose from.']);
		const many = Array.from({ length: 256 }, (_, index) => `"v${index}"`).join(', ');
		expect(decide('String', `source: "body", values: [${many}]`)).toEqual(['Give 2 to 255 values to choose from.']);
		expect(decide('String', 'source: "body", values: ["a", "a"]')).toEqual(['Each value must be different.']);
		expect(decide('String', 'source: "body", values: ["a", "b"], minimum: 1')).toContain(
			'A String field takes values, not a minimum and maximum.',
		);
		expect(decide('Boolean', 'source: "body", values: ["a", "b"]')).toEqual([
			'A Boolean field takes no values, minimum or maximum.',
		]);
		expect(decide('Int', 'source: "body", values: ["a", "b"], minimum: 1, maximum: 2')).toEqual([
			'An Int field takes a minimum and maximum, not values.',
		]);
	});

	it('needs a 32-bit range of 2 to 255 whole numbers on an Int field', () => {
		expect(decide('Int', 'source: "body", minimum: 1')).toEqual(['Give both a minimum and a maximum.']);
		expect(decide('Int', 'source: "body", minimum: 5, maximum: 5')).toEqual([
			'The range must cover 2 to 255 whole numbers.',
		]);
		expect(decide('Int', 'source: "body", minimum: 5, maximum: 1')).toEqual([
			'The range must cover 2 to 255 whole numbers.',
		]);
		expect(decide('Int', 'source: "body", minimum: 0, maximum: 255')).toEqual([
			'The range must cover 2 to 255 whole numbers.',
		]);
		expect(decide('Int', 'source: "body", minimum: 0, maximum: 254')).toEqual([]);
		expect(decide('Int', 'source: "body", minimum: -5, maximum: 5')).toEqual([]);
		expect(decide('Int', 'source: "body", minimum: 2147483647, maximum: 2147483648')).toEqual([
			'The minimum and maximum must be from -2147483648 to 2147483647.',
		]);
		expect(decide('Int', 'source: "body", minimum: 1.5, maximum: 5')).toEqual([
			'@decide\'s "minimum" must be a whole number.',
		]);
	});

	it('refuses an argument Harper does not have, or one of the wrong kind', () => {
		expect(decide('Boolean', 'source: "body", prompt: "x"')).toEqual(['@decide has no "prompt" argument.']);
		expect(decide('Boolean', 'source: body')).toContain('@decide\'s "source" must be a quoted string.');
		expect(decide('String', 'source: "body", values: "a,b"')).toEqual([
			'@decide\'s "values" must be a list of quoted strings.',
		]);
		expect(decide('String', 'source: "body", values: [1, 2]')).toEqual([
			'@decide\'s "values" must be a list of quoted strings.',
		]);
	});

	it('refuses a required field, a primary key and a computed field', () => {
		expect(decide('Boolean!', 'source: "body"')).toEqual([
			"@decide can't fill a required field: an empty source clears it.",
		]);
		expect(decide('String', 'source: "body", values: ["a", "b"]', ' @primaryKey')).toEqual([
			"@decide can't be on a primary key or a computed field.",
		]);
		expect(decide('Boolean', 'source: "body"', ' @computed(from: "body")')).toHaveLength(1);
	});

	it('needs confidence and decision, when given, to name fields of the table', () => {
		expect(decide('Boolean', 'source: "body", confidence: ""')).toContain('@decide\'s "confidence" must name a field.');
		expect(decide('Boolean', 'source: "body", decision: "nope"')).toEqual([
			'There is no field named "nope" for @decide\'s "decision".',
		]);
		expect(decide('Boolean', 'source: "body", confidence: "why", decision: "why"')).toContain(
			'@decide\'s field, "source", "confidence" and "decision" must be different fields.',
		);
	});

	it('reads and writes the values as a list of strings', () => {
		const field = fieldOf(tableOf(`${BASE}\tlabel: String @decide(source: "body", values: ["a, b", "c"])`), 'label');
		expect(decideValues(field.directives)).toEqual(['a, b', 'c']);
		const next = setDecideValues(field.directives, ['x', 'say "hi"']);
		expect(decideValues(next)).toEqual(['x', 'say "hi"']);
		expect(getArgValue(setDecideValues(field.directives, []), 'decide', 'values')).toBeUndefined();
		expect(decideValues(withDecide(fieldOf(tableOf(`${BASE}\tlabel: String`), 'label'), true).directives))
			.toBeUndefined();
	});
});

describe('both directives', () => {
	it('cannot fill the same field', () => {
		const errors = errorsFor(
			`${BASE}\tvector: [Float] @embed(source: "body", model: "m") @decide(source: "body")`,
			'vector',
		);
		expect(errors).toContain('@decide on "vector" also fills "vector", and only one directive can.');
	});

	it('cannot read a field that a directive fills, their own included', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: "vector", model: "m")`, 'vector')).toEqual([
			'@embed can\'t read "vector": @embed on "vector" fills it.',
		]);
		const chained =
			`${BASE}\tlabel: String @decide(source: "body", values: ["a", "b"])\n\turgent: Boolean @decide(source: "label")`;
		expect(errorsFor(chained, 'urgent')).toEqual(['@decide can\'t read "label": @decide on "label" fills it.']);
		expect(errorsFor(chained, 'label')).toEqual([]);
		const viaConfidence =
			`${BASE}\turgent: Boolean @decide(source: "body", confidence: "score")\n\tspam: Boolean @decide(source: "score")`;
		expect(errorsFor(viaConfidence, 'spam')).toEqual(['@decide can\'t read "score": @decide on "urgent" fills it.']);
	});

	it('cannot share a confidence or decision field, or fill one another directive fills', () => {
		const shared =
			`${BASE}\turgent: Boolean @decide(source: "body", confidence: "score")\n\tspam: Boolean @decide(source: "body", confidence: "score")`;
		expect(errorsFor(shared, 'urgent')).toEqual(['@decide on "spam" also fills "score", and only one directive can.']);
		expect(errorsFor(shared, 'spam')).toEqual(['@decide on "urgent" also fills "score", and only one directive can.']);
		const separate = `${BASE}\turgent: Boolean @decide(source: "body")\n\tspam: Boolean @decide(source: "body")`;
		expect(errorsFor(separate, 'urgent')).toEqual([]);
	});

	it('needs a nullable Float for confidence and a nullable String for decision', () => {
		const decide = (fields: string, args: string) =>
			errorsFor(`${BASE}${fields}\turgent: Boolean @decide(source: "body", ${args})`, 'urgent');
		expect(decide('', 'confidence: "why"')).toEqual([
			'@decide\'s "confidence" needs a Float field, and "why" isn\'t one.',
		]);
		expect(decide('', 'decision: "score"')).toEqual([
			'@decide\'s "decision" needs a String field, and "score" isn\'t one.',
		]);
		expect(decide('\tsure: Float!\n', 'confidence: "sure"')).toEqual([
			'@decide\'s "confidence" field "sure" can\'t be required: an empty source clears it.',
		]);
		expect(decide('\tscores: [Float]\n', 'confidence: "scores"')).toHaveLength(1);
		expect(decide('\tnote: String @computed(from: "body")\n', 'decision: "note"')).toEqual([
			'@decide\'s "decision" field "note" can\'t be a primary key or a computed field.',
		]);
	});

	it('reads a block string as Harper does, so a schema Harper takes is not refused', () => {
		expect(graphqlStringValue('"""body"""')).toBe('body');
		expect(graphqlStringValue('"""\n\t\tfirst\n\t\t  second\n\t"""')).toBe('first\n  second');
		expect(graphqlStringValue('"""say \\"""hi\\""" """')).toBe('say """hi""" ');
		expect(graphqlStringValue('"plain"')).toBe('plain');
		expect(graphqlStringValue('bare')).toBeUndefined();
		expect(errorsFor(`${BASE}\tflag: Boolean @decide(source: """body""")`, 'flag')).toEqual([]);
		expect(errorsFor(`${BASE}\tvector: [Float] @embed(source: """body""", model: """m""")`, 'vector')).toEqual([]);
		expect(errorsFor(`${BASE}\tlabel: String @decide(source: "body", values: ["""a""", "b"])`, 'label')).toEqual([]);
		const values = (literal: string) =>
			errorsFor(`${BASE}\tlabel: String @decide(source: "body", values: ${literal})`, 'label');
		const notAList = ['@decide\'s "values" must be a list of quoted strings.'];
		expect(values('[1, 2]')).toEqual(notAList);
		expect(values('"""not-a-list"""')).toEqual(notAList);
		expect(values('["""a""", 123]')).toEqual(notAList);
		expect(values('["""only-one"""]')).toEqual(['Give 2 to 255 values to choose from.']);
		expect(values('["""dup""", """dup"""]')).toEqual(['Each value must be different.']);
		expect(decideValues(fieldOf(tableOf(`${BASE}\tl: String @decide(values: ["""a "b" """, "c"])`), 'l').directives))
			.toEqual([
				'a "b" ',
				'c',
			]);
	});

	it('says a reason once, however many arguments earn it', () => {
		const errors = errorsFor(`${BASE}\ttoString: Boolean @decide(source: "toString")`, 'toString');
		expect(errors.filter((error) => error === '@decide can\'t use a field named "toString".')).toHaveLength(1);
	});

	it('cannot use a field named like an Object.prototype member', () => {
		expect(errorsFor(`${BASE}\ttoString: String\n\tflag: Boolean @decide(source: "toString")`, 'flag')).toEqual([
			'@decide can\'t use a field named "toString".',
		]);
		expect(errorsFor(`${BASE}\tconstructor: [Float] @embed(source: "body", model: "m")`, 'constructor')).toEqual([
			'@embed can\'t use a field named "constructor".',
		]);
	});

	it('leave a field with neither alone', () => {
		expect(errorsFor(`${BASE}\tvector: [Float] @indexed`, 'vector')).toEqual([]);
	});

	it('survive a save untouched, and are written out when edited', () => {
		const source =
			'type Ticket @table {\n\tid: ID @primaryKey\n\tbody: String\n\tlabel: String @decide(source: "body", values: ["a", "b"])\n}\n';
		const document = parseSchema(source).document;
		expect(serializeSchema(document)).toBe(source);
		const segment = document.segments.find((s) => s.kind === 'table');
		if (segment?.kind !== 'table') {
			throw new Error('no table');
		}
		const table = segment.table;
		const fields = table.fields.map((field) =>
			field.name === 'label'
				? { ...field, directives: setDecideValues(field.directives, ['billing', 'bug', 'other']) }
				: field
		);
		const edited = {
			...document,
			segments: document.segments.map((s) =>
				s.kind === 'table' ? { kind: 'table' as const, table: { ...table, fields, edited: true } } : s
			),
		};
		expect(serializeSchema(edited)).toContain(
			'label: String @decide(source: "body", values: ["billing", "bug", "other"])',
		);
	});
});
