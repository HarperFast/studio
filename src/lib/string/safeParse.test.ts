import { describe, expect, it, vi } from 'vitest';

import { safeParse } from './safeParse';

describe('safeParse', () => {
	it('parses valid JSON strings', () => {
		const parsed = safeParse<{ id: number; name: string }>('{"id":1,"name":"test"}');

		expect(parsed).toEqual({ id: 1, name: 'test' });
	});

	it('does not check the schema', () => {
		const parsed = safeParse<{ id: number; name: string }>('{"id":"a STRING oh my goodness","name":"how SNEAKY!"}');

		expect(parsed).toHaveProperty('id', expect.any(String));
		expect(parsed).toHaveProperty('name', expect.any(String));
	});

	it('returns null for nullish sentinel values', () => {
		expect(safeParse('null')).toBeNull();
		expect(safeParse('undefined')).toBeNull();
		expect(safeParse(null)).toBeNull();
		expect(safeParse(undefined)).toBeNull();
	});

	it('returns null and logs when parsing fails', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = safeParse('not-json');

		expect(result).toBeNull();
		expect(errorSpy).toHaveBeenCalledTimes(1);

		const [message, err] = errorSpy.mock.calls[0];
		expect(message).toBe('safeParse failed to parse value, returning null instead');
		expect(err).toBeInstanceOf(Error);

		errorSpy.mockRestore();
	});
});
