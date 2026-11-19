import { describe, expect, it } from 'vitest';
import {
	appRedirectTarget,
	postSignInRedirect,
	postSignInRedirectParam,
	redirectFromFragment,
	redirectSearch,
} from './postSignInRedirect';

// The return path central-manager's oauth plugin builds (`authorizeReturnPath`, `lib/mcp/sessionLogin.js`), as
// TanStack Router hands it over once it has decoded `?redirect=` a single time.
const MCP_AUTHORIZE = `/oauth/mcp/authorize?${new URLSearchParams({
	response_type: 'code',
	client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata',
	redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
	code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
	code_challenge_method: 'S256',
	resource: 'https://fabric.harper.fast/mcp',
	scope: 'mcp read',
	state: 'xyz',
})}`;

describe('postSignInRedirect', () => {
	it('follows the Fabric MCP authorization endpoint with a full-page load', () => {
		expect(postSignInRedirect(MCP_AUTHORIZE)).toEqual({ kind: 'server', href: MCP_AUTHORIZE });
		expect(postSignInRedirect('/oauth/mcp/authorize')).toEqual({ kind: 'server', href: '/oauth/mcp/authorize' });
	});

	it('survives the round trip through the sign-in URL the plugin builds', () => {
		const signInHash = `#/sign-in?redirect=${encodeURIComponent(MCP_AUTHORIZE)}`;
		const redirect = new URLSearchParams(signInHash.slice(signInHash.indexOf('?') + 1)).get('redirect');
		expect(postSignInRedirect(redirect)).toEqual({ kind: 'server', href: MCP_AUTHORIZE });
	});

	it('keeps an in-app route for the router', () => {
		expect(postSignInRedirect('/org-1/clu-1/usage')).toEqual({ kind: 'app', to: '/org-1/clu-1/usage' });
		expect(postSignInRedirect('/')).toEqual({ kind: 'app', to: '/' });
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize?x=1'],
		['a protocol-relative host', '//evil.example/oauth/mcp/authorize'],
		['a backslash host', '/\\evil.example/oauth/mcp/authorize'],
		['a script URL', 'javascript:alert(1)'],
		['a data URL', 'data:text/html,<script>alert(1)</script>'],
		['a relative path', 'oauth/mcp/authorize'],
		['an empty value', ''],
	])('refuses %s', (_label, redirect) => {
		expect(postSignInRedirect(redirect)).toBeUndefined();
	});

	it.each([
		['a longer path', '/oauth/mcp/authorize/../../admin'],
		['a sibling path', '/oauth/mcp/authorizeX'],
		['a different case', '/OAUTH/mcp/authorize?x=1'],
		['another oauth endpoint', '/oauth/google/login?redirect=https://evil.example'],
		['the token endpoint', '/oauth/mcp/token'],
		['an encoded slash', '/oauth%2Fmcp%2Fauthorize?x=1'],
		['an encoded query mark', '/oauth/mcp/authorize%3Fx=1'],
		['an encoded dot segment', '/oauth/mcp/authorize%2F..%2F..%2Fadmin'],
		['a twice-encoded value', encodeURIComponent(MCP_AUTHORIZE)],
	])('follows neither the server nor the app to %s', (_label, redirect) => {
		expect(postSignInRedirect(redirect)).toBeUndefined();
	});

	it.each([
		['a tab, which URL parsing strips', `/oauth/mcp/authorize?x=1\t//evil.example`],
		['a newline', `/oauth/mcp/authorize?x=1\n`],
		['a space', '/oauth/mcp/authorize?x=1 y'],
		['a DEL character', '/oauth/mcp/authorize?x=1\x7f'],
		['a backslash', '/oauth/mcp/authorize?x=\\evil'],
		['a fragment', '/oauth/mcp/authorize?x=1#frag'],
		['more than the plugin itself would send', `/oauth/mcp/authorize?pad=${'a'.repeat(2048)}`],
	])('refuses the authorize path carrying %s', (_label, redirect) => {
		expect(postSignInRedirect(redirect)).toBeUndefined();
	});

	it('accepts the authorize path at the length limit', () => {
		const redirect = `/oauth/mcp/authorize?pad=${'a'.repeat(2048 - '/oauth/mcp/authorize?pad='.length)}`;
		expect(redirect).toHaveLength(2048);
		expect(postSignInRedirect(redirect)?.kind).toBe('server');
	});

	it.each([
		['a number', 123],
		['a boolean', true],
		['an object', { href: '/oauth/mcp/authorize' }],
		['an array', ['/oauth/mcp/authorize']],
		['nothing', undefined],
		['null', null],
	])('ignores a redirect that is %s', (_label, redirect) => {
		expect(postSignInRedirect(redirect)).toBeUndefined();
	});
});

describe('appRedirectTarget', () => {
	it('keeps an in-app route', () => {
		expect(appRedirectTarget('/org-1/clu-1/instance/ins-1/logs?level=error')).toBe(
			'/org-1/clu-1/instance/ins-1/logs?level=error',
		);
	});

	it.each([
		['a protocol-relative host', '//evil.example/x'],
		['a backslash host', '/\\evil.example/x'],
		['another host', 'https://evil.example/x'],
		['a relative path', 'org-1'],
		['a number', 42],
		// What the router decodes `?redirect=/a&redirect=/b` to; `RegExp.test` would read it as the text "/a,/b".
		['a repeated parameter', ['/org-1', '/org-2']],
		['a tab before a second slash, which URL parsing strips to //', '/\t/evil.example'],
		['a newline', '/org-1\n'],
		['a DEL character', '/org-1\x7f'],
		['a server oauth path', '/oauth/google/login'],
		['the authorize path, which only a Fabric sign-in follows', '/oauth/mcp/authorize?x=1'],
	])('refuses %s', (_label, redirect) => {
		expect(appRedirectTarget(redirect)).toBeUndefined();
	});
});

describe('redirectFromFragment', () => {
	const encoded = encodeURIComponent(MCP_AUTHORIZE);

	it("reads redirect from the fragment's own query", () => {
		expect(redirectFromFragment(`#/check-oauth?redirect=${encoded}`)).toBe(MCP_AUTHORIZE);
		expect(redirectFromFragment(`#/check-oauth?redirect=${encoded}&oauth_handoff=code-1`)).toBe(MCP_AUTHORIZE);
	});

	it('stops at a second #', () => {
		expect(redirectFromFragment(`#/check-oauth?redirect=${encoded}#section`)).toBe(MCP_AUTHORIZE);
	});

	it('finds none without one', () => {
		expect(redirectFromFragment('#/check-oauth')).toBeUndefined();
		expect(redirectFromFragment('#/check-oauth?oauth_handoff=code-1')).toBeUndefined();
		expect(redirectFromFragment('')).toBeUndefined();
	});
});

describe('redirectSearch', () => {
	it('carries a redirect to follow', () => {
		expect(redirectSearch(MCP_AUTHORIZE)).toEqual({ redirect: MCP_AUTHORIZE });
		expect(redirectSearch('/org-1')).toEqual({ redirect: '/org-1' });
	});

	it('carries no search at all for one not to follow', () => {
		expect(redirectSearch('//evil.example')).toBeUndefined();
		expect(redirectSearch(undefined)).toBeUndefined();
	});
});

describe('postSignInRedirectParam', () => {
	it('carries either kind on as the value to follow', () => {
		expect(postSignInRedirectParam(MCP_AUTHORIZE)).toBe(MCP_AUTHORIZE);
		expect(postSignInRedirectParam('/org-1')).toBe('/org-1');
	});

	it('drops one not to follow', () => {
		expect(postSignInRedirectParam('//evil.example')).toBeUndefined();
		expect(postSignInRedirectParam(7)).toBeUndefined();
	});
});
