import { describe, expect, it } from 'vitest';
import {
	buildDirectiveSignature,
	detectCompletionContext,
	detectHoverTarget,
	hoverMarkdownValue,
	parseTypeNames,
} from './graphql';
import { availableOn, findArgInputType, findDirective, findScalar } from './schema';

describe('detectCompletionContext', () => {
	it('detects a directive after @', () => {
		expect(detectCompletionContext('type Dog @')).toEqual({ kind: 'directive' });
		expect(detectCompletionContext('  name: String @ind')).toEqual({ kind: 'directive' });
	});

	it('detects directive arguments inside an open paren', () => {
		expect(detectCompletionContext('  vector: [Float] @indexed(')).toEqual({
			kind: 'directiveArg',
			directive: 'indexed',
		});
		expect(detectCompletionContext('type Dog @table(table: "dogs", ')).toEqual({
			kind: 'directiveArg',
			directive: 'table',
		});
	});

	it('does not treat a colon inside directive args as a field type', () => {
		expect(detectCompletionContext('  v: [Float] @indexed(type: ')).toEqual({
			kind: 'directiveArg',
			directive: 'indexed',
		});
	});

	it('detects a field type position after a colon', () => {
		expect(detectCompletionContext('  id: ')).toEqual({ kind: 'fieldType' });
		expect(detectCompletionContext('  id: ID')).toEqual({ kind: 'fieldType' });
		expect(detectCompletionContext('  tags: [Str')).toEqual({ kind: 'fieldType' });
	});

	it('returns none when no Harper context applies', () => {
		expect(detectCompletionContext('type Dog {')).toEqual({ kind: 'none' });
		expect(detectCompletionContext('')).toEqual({ kind: 'none' });
	});
});

describe('parseTypeNames', () => {
	it('collects type/enum/input/interface/scalar/union names', () => {
		const doc = `
			type Dog @table { id: ID }
			enum Breed { LAB }
			input DogInput { name: String }
			interface Animal { id: ID }
		`;
		expect(parseTypeNames(doc).sort()).toEqual(['Animal', 'Breed', 'Dog', 'DogInput']);
	});

	it('returns an empty array when there are no declarations', () => {
		expect(parseTypeNames('# just a comment')).toEqual([]);
	});
});

describe('detectHoverTarget', () => {
	it('resolves a directive when preceded by @', () => {
		const target = detectHoverTarget({ word: 'table', charBeforeWord: '@', textBeforeWord: 'type Dog ' });
		expect(target).toEqual({ kind: 'directive', directive: findDirective('table') });
	});

	it('does not resolve an unknown directive', () => {
		expect(detectHoverTarget({ word: 'unknown', charBeforeWord: '@', textBeforeWord: '' })).toBeUndefined();
	});

	it('resolves a Harper scalar', () => {
		const target = detectHoverTarget({ word: 'Long', charBeforeWord: ' ', textBeforeWord: '  count: ' });
		expect(target).toEqual({ kind: 'scalar', scalar: findScalar('Long') });
	});

	it('resolves a directive argument inside an open paren', () => {
		const target = detectHoverTarget({
			word: 'distance',
			charBeforeWord: ' ',
			textBeforeWord: '  v: [Float] @indexed(type: "HNSW", ',
		});
		expect(target?.kind).toBe('directiveArg');
		if (target?.kind === 'directiveArg') {
			expect(target.directive.name).toBe('indexed');
			expect(target.arg.name).toBe('distance');
		}
	});

	it('returns undefined for an ordinary identifier', () => {
		expect(detectHoverTarget({ word: 'name', charBeforeWord: ' ', textBeforeWord: '  name: String' }))
			.toBeUndefined();
	});
});

describe('buildDirectiveSignature', () => {
	it('includes arguments and locations', () => {
		expect(buildDirectiveSignature(findDirective('relationship')!)).toBe(
			'@relationship(from: String, to: String) on FIELD_DEFINITION',
		);
	});

	it('omits parens for argument-less directives', () => {
		expect(buildDirectiveSignature(findDirective('primaryKey')!)).toBe('@primaryKey on FIELD_DEFINITION');
	});
});

describe('hoverMarkdownValue', () => {
	it('renders directive docs with a signature and description', () => {
		const value = hoverMarkdownValue({ kind: 'directive', directive: findDirective('table')! });
		expect(value).toContain('@table');
		expect(value).toContain('persist it as a table');
	});

	it('labels Harper-specific scalars', () => {
		const value = hoverMarkdownValue({ kind: 'scalar', scalar: findScalar('Long')! });
		expect(value).toContain('Harper scalar');
		expect(value).toContain('64-bit signed integer');
	});
});

describe('@fullText completion across lines', () => {
	const head = 'type Product @table(audit: true) {\n\ttitle: String\n\tcatalogSearch: FullText\n\t\t@fullText(\n';

	it('offers @fullText’s arguments on the lines inside its parentheses', () => {
		expect(detectCompletionContext(`${head}\t\t\t`)).toEqual({ kind: 'directiveArg', directive: 'fullText' });
		expect(detectCompletionContext(`${head}\t\t\tfields: [{ name: "title" }]\n\t\t\t`))
			.toEqual({ kind: 'directiveArg', directive: 'fullText' });
	});

	it('offers the input type’s fields inside an argument’s object', () => {
		expect(detectCompletionContext(`${head}\t\t\tfields: [{ name: "title", `))
			.toEqual({ kind: 'inputField', directive: 'fullText', inputType: 'FullTextSource' });
		expect(detectCompletionContext(`${head}\t\t\tfields: [{ name: "title" }, { `))
			.toEqual({ kind: 'inputField', directive: 'fullText', inputType: 'FullTextSource' });
		expect(detectCompletionContext(`${head}\t\t\thighlighting: { `))
			.toEqual({ kind: 'inputField', directive: 'fullText', inputType: 'FullTextHighlighting' });
		expect(detectCompletionContext(`${head}\t\t\tsynonyms: [{ source: "shoe", `))
			.toEqual({ kind: 'inputField', directive: 'fullText', inputType: 'FullTextSynonymRule' });
	});

	it('is not fooled by brackets inside strings or comments', () => {
		expect(detectCompletionContext(`${head}\t\t\tfields: [{ name: "ti)tle" # a ) comment\n`))
			.toEqual({ kind: 'inputField', directive: 'fullText', inputType: 'FullTextSource' });
	});

	it('leaves the directive once its parentheses close', () => {
		const closed = `${head}\t\t\tfields: [{ name: "title" }]\n\t\t)\n\tprice: `;
		expect(detectCompletionContext(closed)).toEqual({ kind: 'fieldType' });
		expect(detectCompletionContext(`${head}\t\t)\n\tother: String @`)).toEqual({ kind: 'directive' });
	});

	it('offers nothing in a list waiting for an object, or inside an argument with no input type', () => {
		expect(detectCompletionContext(`${head}\t\t\tfields: [`)).toEqual({ kind: 'none' });
		expect(detectCompletionContext('  v: [Float] @indexed(type: { ')).toEqual({ kind: 'none' });
	});

	it('hovers a source field and an argument written on their own lines', () => {
		const sourceField = detectHoverTarget({
			word: 'weight',
			charBeforeWord: ' ',
			textBeforeWord: `${head}\t\t\tfields: [{ name: "title", `,
		});
		expect(sourceField?.kind).toBe('inputField');
		if (sourceField?.kind === 'inputField') {
			expect(sourceField.inputType.name).toBe('FullTextSource');
			expect(hoverMarkdownValue(sourceField)).toContain('_field of `FullTextSource`_');
		}
		const arg = detectHoverTarget({ word: 'synonyms', charBeforeWord: '\t', textBeforeWord: `${head}\t\t\t` });
		expect(arg?.kind).toBe('directiveArg');
	});
});

describe('version gating', () => {
	it('offers FullText and @fullText from 5.3.0, but not on a 5.3.0 prerelease or earlier', () => {
		const fullText = findScalar('FullText')!;
		const directive = findDirective('fullText')!;
		for (const item of [fullText, directive]) {
			expect(availableOn(item, '5.3.0')).toBe(true);
			expect(availableOn(item, '5.4.0-beta.2')).toBe(true);
			expect(availableOn(item, '5.3.0-beta.4')).toBe(false);
			expect(availableOn(item, '5.2.15')).toBe(false);
			// An unreadable version hides nothing.
			expect(availableOn(item, undefined)).toBe(true);
		}
		expect(availableOn(findScalar('String')!, '4.7.0')).toBe(true);
	});

	it('maps each @fullText object argument to its input type', () => {
		expect(findArgInputType('fullText', 'fields')?.name).toBe('FullTextSource');
		expect(findArgInputType('fullText', 'synonyms')?.name).toBe('FullTextSynonymRule');
		expect(findArgInputType('fullText', 'highlighting')?.name).toBe('FullTextHighlighting');
		expect(findArgInputType('fullText', 'analyzer')).toBeUndefined();
	});
});
