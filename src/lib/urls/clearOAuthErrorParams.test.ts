import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearOAuthErrorParamsFromUrl, stripOAuthErrorParams } from './clearOAuthErrorParams';

describe('stripOAuthErrorParams', () => {
	it('removes error and reason, leaving an empty search', () => {
		expect(stripOAuthErrorParams('?error=auth_failed&reason=csrf')).toBe('');
	});

	it('removes error alone', () => {
		expect(stripOAuthErrorParams('?error=invalid_request')).toBe('');
	});

	it('preserves non-error params and their order', () => {
		expect(stripOAuthErrorParams('?redirect=%2Fhome&error=auth_failed&reason=csrf&me=a%40b.com')).toBe(
			'?redirect=%2Fhome&me=a%40b.com',
		);
	});

	it('does not strip params that merely contain "error" or "reason" elsewhere', () => {
		expect(stripOAuthErrorParams('?error_description=bad&reasoning=1')).toBe('?error_description=bad&reasoning=1');
	});

	it('accepts a search string without the leading "?"', () => {
		expect(stripOAuthErrorParams('error=auth_failed&keep=1')).toBe('?keep=1');
	});

	it('returns the input verbatim when there is nothing to remove', () => {
		expect(stripOAuthErrorParams('?keep=1')).toBe('?keep=1');
		expect(stripOAuthErrorParams('')).toBe('');
	});
});

describe('clearOAuthErrorParamsFromUrl', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function stubLocation(search: string, hash = '#/check-oauth') {
		const replaceState = vi.fn();
		vi.stubGlobal('location', { origin: 'https://studio.harperdb.io', pathname: '/', search, hash });
		vi.stubGlobal('history', { state: { key: 'abc' }, replaceState });
		return replaceState;
	}

	it('rewrites the URL without error/reason, preserving pathname and hash', () => {
		const replaceState = stubLocation('?error=auth_failed&reason=csrf', '#/check-oauth');
		clearOAuthErrorParamsFromUrl();
		expect(replaceState).toHaveBeenCalledWith({ key: 'abc' }, '', 'https://studio.harperdb.io/#/check-oauth');
	});

	it('keeps non-error params while dropping error/reason', () => {
		const replaceState = stubLocation('?error=auth_failed&redirect=%2Fhome', '#/check-oauth');
		clearOAuthErrorParamsFromUrl();
		expect(replaceState).toHaveBeenCalledWith(
			{ key: 'abc' },
			'',
			'https://studio.harperdb.io/?redirect=%2Fhome#/check-oauth',
		);
	});

	it('does nothing when there are no error params', () => {
		const replaceState = stubLocation('?redirect=%2Fhome', '#/check-oauth');
		clearOAuthErrorParamsFromUrl();
		expect(replaceState).not.toHaveBeenCalled();
	});

	it('does nothing when there is no search string at all', () => {
		const replaceState = stubLocation('', '#/check-oauth');
		clearOAuthErrorParamsFromUrl();
		expect(replaceState).not.toHaveBeenCalled();
	});

	it('is a harmless no-op when browser globals are unavailable', () => {
		// No stubs: `location`/`history` are undefined in the node test env.
		expect(() => clearOAuthErrorParamsFromUrl()).not.toThrow();
	});
});
