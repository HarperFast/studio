/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { clearOAuthHandoffCodeFromUrl, readOAuthHandoffCodeFromUrl, splitOAuthHandoffCode } from './oauthHandoff';

afterEach(() => {
	history.replaceState(null, '', '/');
});

describe('splitOAuthHandoffCode', () => {
	it('takes the code out of the fragment query', () => {
		expect(splitOAuthHandoffCode('#/check-oauth?oauth_handoff=abc_-1')).toEqual({
			code: 'abc_-1',
			hash: '#/check-oauth',
		});
	});

	it('keeps the fragment query parameters it does not own', () => {
		expect(splitOAuthHandoffCode('#/check-oauth?redirect=%2Forg%2Fx&oauth_handoff=abc')).toEqual({
			code: 'abc',
			hash: '#/check-oauth?redirect=%2Forg%2Fx',
		});
	});

	it('handles the bare fragment the plugin builds for a URL that had none', () => {
		expect(splitOAuthHandoffCode('#?oauth_handoff=abc')).toEqual({ code: 'abc', hash: '#' });
	});

	it('leaves a hash without a code unchanged', () => {
		for (const hash of ['', '#/check-oauth', '#/check-oauth?redirect=%2Fx', '#/check-oauth?oauth_handoffs=abc']) {
			expect(splitOAuthHandoffCode(hash)).toEqual({ code: null, hash });
		}
	});

	it('removes an empty code without reporting one', () => {
		expect(splitOAuthHandoffCode('#/check-oauth?oauth_handoff=')).toEqual({ code: null, hash: '#/check-oauth' });
	});
});

describe('the browser URL', () => {
	it('reads the code, then clears it without touching the path or search', () => {
		history.replaceState(null, '', '/?keep=1#/check-oauth?redirect=%2Fx&oauth_handoff=abc');
		expect(readOAuthHandoffCodeFromUrl()).toBe('abc');

		clearOAuthHandoffCodeFromUrl();

		expect(location.pathname).toBe('/');
		expect(location.search).toBe('?keep=1');
		expect(location.hash).toBe('#/check-oauth?redirect=%2Fx');
		expect(readOAuthHandoffCodeFromUrl()).toBeNull();
	});

	it('leaves a URL without a code alone', () => {
		history.replaceState({ marker: 1 }, '', '/#/check-oauth');
		clearOAuthHandoffCodeFromUrl();
		expect(location.hash).toBe('#/check-oauth');
		expect(history.state).toEqual({ marker: 1 });
	});
});
