import {
	checkOAuthRedirect,
	checkOAuthRedirectUrl,
	getOAuthHandoffUrl,
	getOAuthSignInUrl,
} from '@/lib/urls/getOAuthSignInUrl';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('getOAuthSignInUrl', () => {
	it('targets the central-manager origin, not whatever origin serves Studio', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		expect(getOAuthSignInUrl('google', checkOAuthRedirect)).toBe(
			'https://cm.test.invalid/oauth/google/login?redirect=%2F%23%2Fcheck-oauth',
		);
	});

	it('leaves the redirect off when it is not given (per-org providers)', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid/');
		expect(getOAuthSignInUrl('oac-123')).toBe('https://cm.test.invalid/oauth/oac-123/login');
	});

	it('names the serving origin in the redirect, so a preview origin the CM lists gets the sign-in', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		expect(getOAuthSignInUrl('google', checkOAuthRedirectUrl({ origin: 'https://pr-1.app.test.invalid' }))).toBe(
			'https://cm.test.invalid/oauth/google/login?redirect=https%3A%2F%2Fpr-1.app.test.invalid%2F%23%2Fcheck-oauth',
		);
	});

	it('stays origin-relative when the CM is the serving origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', '/');
		expect(getOAuthSignInUrl('github', checkOAuthRedirect)).toBe(
			'/oauth/github/login?redirect=%2F%23%2Fcheck-oauth',
		);
	});
});

describe('checkOAuthRedirectUrl', () => {
	const origin = 'https://fabric.test.invalid';
	const mcpAuthorize = '/oauth/mcp/authorize?response_type=code&client_id=c&state=s';

	it('carries the Fabric MCP authorization on to /#/check-oauth', () => {
		const url = checkOAuthRedirectUrl({ origin, redirect: mcpAuthorize });
		expect(url).toBe(`${origin}/#/check-oauth?redirect=${encodeURIComponent(mcpAuthorize)}`);
		// What the CM's `sanitizeRedirect` keeps of it (pathname + search + hash) still names the target.
		const kept = new URL(url);
		const hash = kept.hash;
		expect(`${kept.pathname}${kept.search}${hash}`).toBe(`/#/check-oauth?redirect=${encodeURIComponent(mcpAuthorize)}`);
		expect(new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('redirect')).toBe(mcpAuthorize);
	});

	it('carries an in-app route too', () => {
		expect(checkOAuthRedirectUrl({ origin, redirect: '/org-1/clu-1' })).toBe(
			`${origin}/#/check-oauth?redirect=%2Forg-1%2Fclu-1`,
		);
	});

	it.each([
		['another host', 'https://evil.example/oauth/mcp/authorize'],
		['a protocol-relative host', '//evil.example'],
		['nothing', undefined],
	])('leaves off %s', (_label, redirect) => {
		expect(checkOAuthRedirectUrl({ origin, redirect })).toBe(`${origin}/#/check-oauth`);
	});
});

describe('getOAuthHandoffUrl', () => {
	it('targets the central-manager origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid/');
		expect(getOAuthHandoffUrl()).toBe('https://cm.test.invalid/oauth/handoff');
	});

	it('stays origin-relative when the CM is the serving origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', '/');
		expect(getOAuthHandoffUrl()).toBe('/oauth/handoff');
	});
});
