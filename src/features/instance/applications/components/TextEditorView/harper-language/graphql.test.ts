import { describe, expect, it } from 'vitest';
import {
	buildDirectiveSignature,
	detectCompletionContext,
	detectHoverTarget,
	hoverMarkdownValue,
	parseTypeNames,
} from './graphql';
import { findDirective, findScalar } from './schema';

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
		const target = detectHoverTarget({ word: 'table', charBeforeWord: '@', lineBeforeWord: 'type Dog ' });
		expect(target).toEqual({ kind: 'directive', directive: findDirective('table') });
	});

	it('does not resolve an unknown directive', () => {
		expect(detectHoverTarget({ word: 'unknown', charBeforeWord: '@', lineBeforeWord: '' })).toBeUndefined();
	});

	it('resolves a Harper scalar', () => {
		const target = detectHoverTarget({ word: 'Long', charBeforeWord: ' ', lineBeforeWord: '  count: ' });
		expect(target).toEqual({ kind: 'scalar', scalar: findScalar('Long') });
	});

	it('resolves a directive argument inside an open paren', () => {
		const target = detectHoverTarget({
			word: 'distance',
			charBeforeWord: ' ',
			lineBeforeWord: '  v: [Float] @indexed(type: "HNSW", ',
		});
		expect(target?.kind).toBe('directiveArg');
		if (target?.kind === 'directiveArg') {
			expect(target.directive.name).toBe('indexed');
			expect(target.arg.name).toBe('distance');
		}
	});

	it('returns undefined for an ordinary identifier', () => {
		expect(detectHoverTarget({ word: 'name', charBeforeWord: ' ', lineBeforeWord: '  name: String' }))
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
