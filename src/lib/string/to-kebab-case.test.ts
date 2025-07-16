import { describe, expect, it } from 'vitest';
import { toKebabCase } from './to-kebab-case';

describe('toKebabCase', () => {
	it('should convert a string with spaces to kebab-case', () => {
		expect(toKebabCase('Hello World')).toBe('hello-world');
		expect(toKebabCase('Multiple   Spaces  Here')).toBe('multiple-spaces-here');
	});

	it('should convert camelCase to kebab-case', () => {
		expect(toKebabCase('camelCase')).toBe('camel-case');
		expect(toKebabCase('thisIsCamelCase')).toBe('this-is-camel-case');
	});

	it('should convert PascalCase to kebab-case', () => {
		expect(toKebabCase('PascalCase')).toBe('pascal-case');
		expect(toKebabCase('ThisIsPascalCase')).toBe('this-is-pascal-case');
	});

	it('should convert snake_case to kebab-case', () => {
		expect(toKebabCase('snake_case')).toBe('snake-case');
		expect(toKebabCase('this_is_snake_case')).toBe('this-is-snake-case');
	});

	it('should handle strings with mixed formats', () => {
		expect(toKebabCase('with spaces and_underscores')).toBe('with-spaces-and-underscores');
		expect(toKebabCase('mixedCamelCase and_snake_case')).toBe('mixed-camel-case-and-snake-case');
	});

	it('should handle strings with special characters', () => {
		expect(toKebabCase('special!@#$%^&*()characters')).toBe('special-characters');
		expect(toKebabCase('dots.and-existing.hyphens')).toBe('dots-and-existing-hyphens');
	});

	it('should handle edge cases', () => {
		expect(toKebabCase('')).toBe('');
		expect(toKebabCase('   ')).toBe('');
		expect(toKebabCase('!@#$%^&*()')).toBe('');
	});
});
