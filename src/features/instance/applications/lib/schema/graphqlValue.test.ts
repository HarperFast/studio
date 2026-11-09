import { describe, expect, it } from 'vitest';
import { GraphqlValue, parseGraphqlValue, printGraphqlValue } from './graphqlValue';

describe('parseGraphqlValue', () => {
	it('reads the shapes @fullText arguments hold', () => {
		expect(parseGraphqlValue('[{ name: "title", weight: 3, highlight: true }, { name: "description" }]')?.value)
			.toEqual([{ name: 'title', weight: 3, highlight: true }, { name: 'description' }]);
		expect(parseGraphqlValue('{ maxFragments: 2, fragmentLength: 120 }')?.value)
			.toEqual({ maxFragments: 2, fragmentLength: 120 });
		expect(parseGraphqlValue('[{ source: "shoe", replacements: ["trainer", "sneaker"] }]')?.value)
			.toEqual([{ source: 'shoe', replacements: ['trainer', 'sneaker'] }]);
	});

	it('reads scalars, including floats, negatives, escapes and null', () => {
		expect(parseGraphqlValue('1.5e2')?.value).toBe(150);
		expect(parseGraphqlValue('-0.25')?.value).toBe(-0.25);
		expect(parseGraphqlValue('"a \\"quoted\\" \\u00e9"')?.value).toBe('a "quoted" é');
		expect(parseGraphqlValue('false')?.value).toBe(false);
		expect(parseGraphqlValue('null')).toEqual({ value: null });
	});

	it('skips commas, newlines and comments the way GraphQL does', () => {
		const literal = `[
			{ name: "title" } # the headline
			{ name: "body" },
		]`;
		expect(parseGraphqlValue(literal)?.value).toEqual([{ name: 'title' }, { name: 'body' }]);
	});

	it('refuses what it would have to guess at', () => {
		for (
			const literal of [
				'ENGLISH', // an enum value
				'$weight', // a variable
				'"""block"""', // a block string
				'{ name: "a", name: "b" }', // a repeated key
				'[1, 2', // unclosed
				'"unterminated',
				'1x', // a number running into a name
				'{ name: "a" } extra', // trailing text
				'',
			]
		) {
			expect(parseGraphqlValue(literal), literal).toBeUndefined();
		}
	});

	it('keeps a key named like an Object.prototype member as an ordinary key', () => {
		const parsed = parseGraphqlValue('{ __proto__: "x", constructor: "y" }')?.value as Record<string, unknown>;
		expect(Object.keys(parsed)).toEqual(['__proto__', 'constructor']);
		expect(parsed.constructor).toBe('y');
	});
});

describe('printGraphqlValue', () => {
	it('prints objects in key order and round-trips through the parser', () => {
		const value: GraphqlValue = [{ name: 'title', weight: 3, highlight: true }, {
			name: 'café "x"',
			mediaType: 'text/plain',
		}];
		const printed = printGraphqlValue(value);
		expect(printed).toBe(
			'[{ name: "title", weight: 3, highlight: true }, { name: "café \\"x\\"", mediaType: "text/plain" }]',
		);
		expect(parseGraphqlValue(printed)?.value).toEqual(value);
	});

	it('prints an empty object and list', () => {
		expect(printGraphqlValue({})).toBe('{}');
		expect(printGraphqlValue([])).toBe('[]');
	});

	it('refuses a number GraphQL has no literal for', () => {
		expect(() => printGraphqlValue(Number.NaN)).toThrow(RangeError);
	});
});
