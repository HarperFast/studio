import { describe, expect, it } from 'vitest';
import { errorText } from './errorText';

describe('errorText', () => {
	it('passes bare strings through', () => {
		expect(errorText('ECONNREFUSED')).toBe('ECONNREFUSED');
	});

	it('extracts message from the structured { message, code } shape Harper records (#1426)', () => {
		expect(errorText({ message: 'install failed', code: 'ERR_INSTALL' })).toBe('install failed');
	});

	it('never renders "[object Object]" for message-less objects', () => {
		expect(errorText({ code: 500 })).toBe('{"code":500}');
	});

	it('ignores a non-string message and falls back to JSON', () => {
		expect(errorText({ message: { nested: true } })).toBe('{"message":{"nested":true}}');
	});

	it.each([[null], [undefined], ['']])('returns undefined for empty input (%s)', (input) => {
		expect(errorText(input)).toBeUndefined();
	});

	it('stringifies primitives', () => {
		expect(errorText(503)).toBe('503');
	});

	it('returns undefined when the object cannot be serialized', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(errorText(circular)).toBeUndefined();
	});
});
