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
		expect(getOAuthSignInUrl('google', checkOAuthRedirectUrl('https://pr-1.app.test.invalid'))).toBe(
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
