import { describe, expect, it } from 'vitest';
import { parseFileExtension } from './parseFileExtension';

/**
 * Test suite for parseFileExtension
 *
 * Covers:
 * - simple extensions (file.txt → txt)
 * - multiple dots (archive.tar.gz → gz)
 * - no extension (noext → '')
 * - hidden files (.gitignore → gitignore, .env.local → local)
 * - trailing dots (weird. → '')
 * - consecutive dots (a..b → b, ..config → config)
 * - empty and undefined inputs ('' and undefined → '')
 */

describe('parseFileExtension', () => {
	describe('simple cases', () => {
		it('returns extension for a simple filename', () => {
			expect(parseFileExtension('file.txt')).toBe('txt');
		});

		it('is case-sensitive in output (does not alter case)', () => {
			expect(parseFileExtension('PHOTO.JPG')).toBe('JPG');
		});
	});

	describe('multiple dots', () => {
		it('returns last segment after the final dot', () => {
			expect(parseFileExtension('archive.tar.gz')).toBe('gz');
		});
	});

	describe('no extension', () => {
		it('returns empty string when no dot is present', () => {
			expect(parseFileExtension('noext')).toBe('');
		});
	});

	describe('hidden files starting with dot', () => {
		it('returns name without leading dot for single-segment hidden file', () => {
			expect(parseFileExtension('.gitignore')).toBe('gitignore');
		});

		it('returns last segment for multi-segment hidden file', () => {
			expect(parseFileExtension('.env.local')).toBe('local');
		});
	});

	describe('trailing dots', () => {
		it('returns empty string when filename ends with a dot', () => {
			expect(parseFileExtension('weird.')).toBe('');
		});
	});

	describe('consecutive dots', () => {
		it('handles consecutive dots inside the name', () => {
			expect(parseFileExtension('a..b')).toBe('b');
		});

		it('handles leading consecutive dots', () => {
			expect(parseFileExtension('..config')).toBe('config');
		});
	});

	describe('empty and undefined inputs', () => {
		it('returns empty string for empty input', () => {
			expect(parseFileExtension('')).toBe('');
		});

		it('returns empty string for undefined input', () => {
			expect(parseFileExtension(undefined)).toBe('');
		});
	});
});
