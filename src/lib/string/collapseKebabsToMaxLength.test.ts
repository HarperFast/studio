import { describe, expect, it } from 'vitest';
import { collapseKebabsToMaxLength } from './collapseKebabsToMaxLength';

describe('collapseKebabsToMaxLength', () => {
	it('should return the original string if it is already within the max length', () => {
		expect(collapseKebabsToMaxLength('short', 10)).toBe('short');
		expect(collapseKebabsToMaxLength('hello-world', 11)).toBe('hello-world');
		expect(collapseKebabsToMaxLength('a-b-c', 5)).toBe('a-b-c');
	});

	it('should collapse segments one by one from the end until it meets the max length', () => {
		expect(collapseKebabsToMaxLength('one-two-three', 8)).toBe('one-t-t');
		expect(collapseKebabsToMaxLength('hello-world', 7)).toBe('hello-w');
		expect(collapseKebabsToMaxLength('a-very-long-string', 10)).toBe('a-v-l-s');
	});

	it('should handle strings with multiple segments', () => {
		expect(collapseKebabsToMaxLength('one-two-three-four-five', 12)).toBe('one-t-t-f-f');
		expect(collapseKebabsToMaxLength('a-b-c-d-e-f-g', 7)).toBe('a-b-c-d');
	});

	it('should truncate the first segment if necessary', () => {
		expect(collapseKebabsToMaxLength('verylongfirst-segment', 10)).toBe('verylong-s');
		expect(collapseKebabsToMaxLength('toolong-a-b-c', 8)).toBe('to-a-b-c');
	});

	it('should handle extreme cases where even maximum collapsing is not enough', () => {
		expect(collapseKebabsToMaxLength('extremely-long-segments', 5)).toBe('e-l-s');
		expect(collapseKebabsToMaxLength('a-b-c-d-e-f-g-h-i-j', 5)).toBe('a-b-c');
	});

	it('should handle edge cases', () => {
		expect(collapseKebabsToMaxLength('', 5)).toBe('');
		expect(collapseKebabsToMaxLength('-', 5)).toBe('-');
		expect(collapseKebabsToMaxLength('a-', 5)).toBe('a-');
		expect(collapseKebabsToMaxLength('-a', 5)).toBe('-a');
		expect(collapseKebabsToMaxLength('a-b-c', 0)).toBe('');
		expect(collapseKebabsToMaxLength('a-b-c', -1)).toBe('');
	});
});
