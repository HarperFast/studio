import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearUtmParamsFromUrl, stripUtmParams } from './clearUtmParams';

describe('stripUtmParams', () => {
	it('removes a single utm parameter, leaving an empty search', () => {
		expect(stripUtmParams('?utm_source=newsletter')).toBe('');
	});

	it('removes every utm_* parameter', () => {
		expect(
			stripUtmParams('?utm_source=x&utm_medium=email&utm_campaign=launch&utm_term=t&utm_content=c'),
		).toBe('');
	});

	it('preserves non-utm parameters and their order', () => {
		expect(stripUtmParams('?redirect=%2Fhome&utm_source=x&me=a%40b.com')).toBe('?redirect=%2Fhome&me=a%40b.com');
	});

	it('matches utm_ prefixes case-insensitively', () => {
		expect(stripUtmParams('?UTM_Source=x&keep=1')).toBe('?keep=1');
	});

	it('does not strip params that merely contain "utm" elsewhere', () => {
		expect(stripUtmParams('?autumn=leaves&product_utm=no')).toBe('?autumn=leaves&product_utm=no');
	});

	it('accepts a search string without the leading "?"', () => {
		expect(stripUtmParams('utm_source=x&keep=1')).toBe('?keep=1');
	});

	it('returns the input verbatim when there is nothing to remove', () => {
		expect(stripUtmParams('?keep=1')).toBe('?keep=1');
		expect(stripUtmParams('')).toBe('');
	});
});

describe('clearUtmParamsFromUrl', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function stubLocation(search: string, hash = '#/cloud/org') {
		const replaceState = vi.fn();
		vi.stubGlobal('location', { origin: 'https://studio.harperdb.io', pathname: '/', search, hash });
		vi.stubGlobal('history', { state: { key: 'abc' }, replaceState });
		return replaceState;
	}

	it('rewrites the URL without utm params, preserving pathname and hash', () => {
		const replaceState = stubLocation('?utm_source=x&utm_campaign=y', '#/cloud/org');
		clearUtmParamsFromUrl();
		expect(replaceState).toHaveBeenCalledWith({ key: 'abc' }, '', 'https://studio.harperdb.io/#/cloud/org');
	});

	it('keeps non-utm params while dropping utm params', () => {
		const replaceState = stubLocation('?utm_source=x&redirect=%2Fhome', '#/sign-in');
		clearUtmParamsFromUrl();
		expect(replaceState).toHaveBeenCalledWith(
			{ key: 'abc' },
			'',
			'https://studio.harperdb.io/?redirect=%2Fhome#/sign-in',
		);
	});

	it('does nothing when there are no utm params', () => {
		const replaceState = stubLocation('?redirect=%2Fhome', '#/sign-in');
		clearUtmParamsFromUrl();
		expect(replaceState).not.toHaveBeenCalled();
	});

	it('does nothing when there is no search string at all', () => {
		const replaceState = stubLocation('', '#/sign-in');
		clearUtmParamsFromUrl();
		expect(replaceState).not.toHaveBeenCalled();
	});

	it('is a harmless no-op when browser globals are unavailable', () => {
		// No stubs: `location`/`history` are undefined in the node test env.
		expect(() => clearUtmParamsFromUrl()).not.toThrow();
	});
});
