import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { parseSearch, stringifySearch } from './searchParams';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';

// Every one of these is valid JSON, which the router's default parse would turn into something else.
const JSON_LOOKING = ['12345678901234567890', '1e5', '0', '-5', 'true', 'false', 'null', '"quoted"', '[1]', '{"a":1}'];

describe('parseSearch', () => {
	it.each([...JSON_LOOKING, JWT, ''])('keeps a token of %j as the URL spells it', (token) => {
		expect(parseSearch(`?token=${encodeURIComponent(token)}`)).toEqual({ token });
	});

	it.each(JSON_LOOKING)('keeps a flow of %j as the URL spells it', (flow) => {
		expect(parseSearch(`?token=t&flow=${encodeURIComponent(flow)}`)).toEqual({ token: 't', flow });
	});

	it('decodes them the way the default parse decodes a string', () => {
		expect(parseSearch('?token=a%2Bb+c%3D')).toEqual(defaultParseSearch('?token=a%2Bb+c%3D'));
	});

	it('takes the first of a repeated token, as `URLSearchParams.get` does', () => {
		expect(parseSearch('?token=12&token=34')).toEqual({ token: '12' });
	});

	it('adds no key for a parameter the URL leaves out', () => {
		expect(Object.keys(parseSearch('?redirect=%2Fx'))).toEqual(['redirect']);
		expect(parseSearch('')).toEqual({});
	});

	it('still JSON-parses every other parameter', () => {
		const searchStr = '?page=2&immediate=true&filters=%7B%22id%22%3A%221%22%7D&project=app&token=7';

		expect(parseSearch(searchStr)).toEqual({ ...defaultParseSearch(searchStr), token: '7' });
		expect(parseSearch(searchStr)).toMatchObject({ page: 2, immediate: true, filters: { id: '1' } });
	});
});

describe('stringifySearch', () => {
	it.each([...JSON_LOOKING, JWT])('writes a token of %j back as the URL spelled it', (token) => {
		const searchStr = `?token=${encodeURIComponent(token)}&flow=${encodeURIComponent(token)}`;

		expect(stringifySearch(parseSearch(searchStr))).toBe(`?${new URLSearchParams(searchStr)}`);
		expect(parseSearch(stringifySearch({ token, flow: token }))).toEqual({ token, flow: token });
	});

	it('keeps the parameters in their order', () => {
		expect(stringifySearch({ redirect: '/x', token: '0', page: 2 })).toBe('?redirect=%2Fx&token=0&page=2');
	});

	it('writes every other parameter as the default does', () => {
		const search = { page: 2, filters: { id: '1' }, project: '0', token: JWT };

		expect(stringifySearch(search)).toBe(defaultStringifySearch(search));
		expect(stringifySearch({})).toBe('');
	});

	it('leaves a token that is not a string to the default', () => {
		expect(stringifySearch({ token: 5 })).toBe(defaultStringifySearch({ token: 5 }));
	});
});
