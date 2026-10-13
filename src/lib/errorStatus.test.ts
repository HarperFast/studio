import { describe, expect, it } from 'vitest';
import { errorStatus } from './errorStatus';

describe('errorStatus', () => {
	it.each([
		['an axios response', { response: { status: 403 } }, 403],
		['a bare status', { status: 404 }, 404],
		['the axios response over a bare status', { response: { status: 500 }, status: 400 }, 500],
		['nothing', {}, undefined],
		['null', null, undefined],
		['a string', 'boom', undefined],
	])('reads %s', (_label, error, expected) => {
		expect(errorStatus(error)).toBe(expected);
	});

	it('returns undefined rather than throwing for a value whose getters throw', () => {
		const hostile = new Proxy({}, {
			get() {
				throw new Error('getter trap');
			},
		});
		expect(errorStatus(hostile)).toBeUndefined();
	});
});
