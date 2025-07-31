import { describe, it, expect } from 'vitest';
import { stringsShareAPrefix } from './stringsShareAPrefix';

describe('stringsShareAPrefix', () => {
	describe('basic functionality', () => {
		it('should return true when a haystack starts with the needle prefix', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = 'test-abc';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});

		it('should return false when no haystack starts with the needle prefix', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = 'other-abc';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(false);
		});

		it('should handle case sensitivity correctly', () => {
			const haystacks = ['Test-123', 'Example-456', 'Sample-789'];
			const needle = 'test-abc';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(false);
		});
	});

	describe('custom delimiter', () => {
		it('should work with a custom delimiter', () => {
			const haystacks = ['test_123', 'example_456', 'sample_789'];
			const needle = 'test_abc';
			expect(stringsShareAPrefix(haystacks, needle, '_')).toBe(true);
		});

		it('should split by the provided delimiter', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = 'test_abc';
			// When using '_' as delimiter, the prefix is 'test' which matches haystacks[0]
			expect(stringsShareAPrefix(haystacks, needle, '_')).toBe(true);

			// When using '.' as delimiter with no dots in the needle, the entire needle becomes the prefix
			expect(stringsShareAPrefix(haystacks, needle, '.')).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle empty haystacks array', () => {
			const haystacks: string[] = [];
			const needle = 'test-abc';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(false);
		});

		it('should handle empty needle string', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = '';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});

		it('should handle needle without delimiter', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = 'test';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});

		it('should handle haystacks with empty strings', () => {
			const haystacks = ['', 'example-456', 'sample-789'];
			const needle = 'test-abc';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(false);
		});

		it('should handle needle with multiple delimiters', () => {
			const haystacks = ['test-123', 'example-456', 'sample-789'];
			const needle = 'test-abc-def';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});
	});

	describe('prefix matching behavior', () => {
		it('should match only the part before the first delimiter', () => {
			const haystacks = ['prefix-different', 'other-stuff'];
			const needle = 'prefix-completely-different';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});

		it('should not match partial prefixes', () => {
			const haystacks = ['longprefix-123', 'example-456'];
			const needle = 'prefix-789';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(false);
		});

		it('should match exact prefix matches', () => {
			const haystacks = ['exact-first', 'other-second'];
			const needle = 'exact-third';
			expect(stringsShareAPrefix(haystacks, needle)).toBe(true);
		});
	});
});
