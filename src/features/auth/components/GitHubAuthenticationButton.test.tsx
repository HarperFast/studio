// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubAuthenticationButton } from './GitHubAuthenticationButton';

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe('GitHubAuthenticationButton', () => {
	it('shows the "Last used" badge when lastUsed is set', () => {
		render(<GitHubAuthenticationButton text="Sign in with GitHub" lastUsed />);
		expect(screen.getByText('Last used')).toBeTruthy();
		expect(screen.getByRole('link')).toBeTruthy();
	});

	it('links to the central-manager login endpoint, returning to the serving origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		render(<GitHubAuthenticationButton text="Sign in with GitHub" />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			`https://cm.test.invalid/oauth/github/login?redirect=${
				encodeURIComponent(`${window.location.origin}/#/check-oauth`)
			}`,
		);
	});

	it("carries the sign-in page's redirect into /#/check-oauth", () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		const redirect = '/oauth/mcp/authorize?response_type=code&client_id=c';
		render(<GitHubAuthenticationButton text="Sign in with GitHub" redirect={redirect} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			`https://cm.test.invalid/oauth/github/login?redirect=${
				encodeURIComponent(`${window.location.origin}/#/check-oauth?redirect=${encodeURIComponent(redirect)}`)
			}`,
		);
	});

	it('drops the href when disabled, but stays focusable and announced', () => {
		render(<GitHubAuthenticationButton text="Sign up with GitHub" disabled />);
		const link = screen.getByRole('link');
		expect(link.hasAttribute('href')).toBe(false);
		expect(link.getAttribute('aria-disabled')).toBe('true');
		expect(link.getAttribute('tabindex')).toBe('0');
	});
});
