import { checkOAuthRedirect, getOAuthSignInUrl } from '@/lib/urls/getOAuthSignInUrl';
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

	it('stays origin-relative when the CM is the serving origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', '/');
		expect(getOAuthSignInUrl('github', checkOAuthRedirect)).toBe(
			'/oauth/github/login?redirect=%2F%23%2Fcheck-oauth',
		);
	});
});
