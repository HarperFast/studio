import { describe, expect, it } from 'vitest';
import { curryFilterByFuzzySearch } from './filterByFuzzySearch';

describe('curryFilterByFuzzySearch', () => {
	describe('string field matching', () => {
		it('should match exact string values', () => {
			const testObj = { stringField: 'hello world' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], 'hello world');
			expect(filter(testObj)).toBe(true);
		});

		it('should match case-insensitive string values', () => {
			const testObj = { stringField: 'Hello World' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], 'hello world');
			expect(filter(testObj)).toBe(true);
		});

		it('should match partial string values', () => {
			const testObj = { stringField: 'hello world' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], 'world');
			expect(filter(testObj)).toBe(true);
		});

		it('should not match when string is not found', () => {
			const testObj = { stringField: 'hello world' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], 'goodbye');
			expect(filter(testObj)).toBe(false);
		});
	});

	describe('boolean field matching', () => {
		it('should match true boolean with "yes"', () => {
			const testObj = { booleanField: true };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], 'yes');
			expect(filter(testObj)).toBe(true);
		});

		it('should match true boolean with "true"', () => {
			const testObj = { booleanField: true };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], 'true');
			expect(filter(testObj)).toBe(true);
		});

		it('should match true boolean with "1"', () => {
			const testObj = { booleanField: true };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], '1');
			expect(filter(testObj)).toBe(true);
		});

		it('should match false boolean with "no"', () => {
			const testObj = { booleanField: false };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], 'no');
			expect(filter(testObj)).toBe(true);
		});

		it('should match false boolean with "false"', () => {
			const testObj = { booleanField: false };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], 'false');
			expect(filter(testObj)).toBe(true);
		});

		it('should match false boolean with "0"', () => {
			const testObj = { booleanField: false };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], '0');
			expect(filter(testObj)).toBe(true);
		});

		it('should not match boolean with unrelated search term', () => {
			const testObj = { booleanField: true };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['booleanField'], 'maybe');
			expect(filter(testObj)).toBe(false);
		});
	});

	describe('null/undefined handling', () => {
		it('should skip undefined fields', () => {
			const testObj = { optionalString: undefined, stringField: 'hello' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['optionalString', 'stringField'], 'hello');
			expect(filter(testObj)).toBe(true);
		});

		it('should skip null fields', () => {
			const testObj = { optionalString: null as unknown as string, stringField: 'hello' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['optionalString', 'stringField'], 'hello');
			expect(filter(testObj)).toBe(true);
		});

		it('should return false when all fields are null/undefined', () => {
			const testObj = { optionalString: undefined };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['optionalString'], 'hello');
			expect(filter(testObj)).toBe(false);
		});
	});

	describe('error handling', () => {
		it('should throw error for unsupported field types', () => {
			const testObj = { numberField: 123 };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['numberField'], '123');
			expect(() => filter(testObj)).toThrow(
				'curryFilterByFuzzySearch has not implemented support for number fields yet!',
			);
		});
	});

	describe('multiple fields', () => {
		it('should match if any field matches the search term', () => {
			const testObj = {
				stringField: 'hello world',
				booleanField: true,
			};
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField', 'booleanField'], 'hello');
			expect(filter(testObj)).toBe(true);
		});

		it('should match if any field matches the search term (boolean case)', () => {
			const testObj = {
				stringField: 'hello world',
				booleanField: true,
			};
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField', 'booleanField'], 'yes');
			expect(filter(testObj)).toBe(true);
		});

		it('should return false if no field matches the search term', () => {
			const testObj = {
				stringField: 'hello world',
				booleanField: true,
			};
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField', 'booleanField'], 'goodbye');
			expect(filter(testObj)).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle empty search string', () => {
			const testObj = { stringField: 'hello world' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], '');
			expect(filter(testObj)).toBe(true);
		});

		it('should return false when no fields are provided', () => {
			const testObj = { stringField: 'hello world' };
			const filter = curryFilterByFuzzySearch<typeof testObj>([], 'hello');
			expect(filter(testObj)).toBe(false);
		});

		it('should handle fields with empty strings', () => {
			const testObj = { stringField: '' };
			const filter = curryFilterByFuzzySearch<typeof testObj>(['stringField'], 'hello');
			expect(filter(testObj)).toBe(false);
		});
	});
});
