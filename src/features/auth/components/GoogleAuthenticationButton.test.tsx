// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthenticationButton } from './GoogleAuthenticationButton';

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe('GoogleAuthenticationButton', () => {
	it('shows the "Last used" badge when lastUsed is set', () => {
		render(<GoogleAuthenticationButton text="Sign in with Google" lastUsed />);
		expect(screen.getByText('Last used')).toBeTruthy();
		expect(screen.getByRole('link')).toBeTruthy();
	});

	it('omits the badge by default', () => {
		render(<GoogleAuthenticationButton text="Sign in with Google" />);
		expect(screen.queryByText('Last used')).toBeNull();
	});

	it('links to the central-manager login endpoint, returning to the serving origin', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		render(<GoogleAuthenticationButton text="Sign in with Google" />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			`https://cm.test.invalid/oauth/google/login?redirect=${
				encodeURIComponent(`${window.location.origin}/#/check-oauth`)
			}`,
		);
	});

	it("carries the sign-in page's redirect into /#/check-oauth", () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		const redirect = '/oauth/mcp/authorize?response_type=code&client_id=c';
		render(<GoogleAuthenticationButton text="Sign in with Google" redirect={redirect} />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			`https://cm.test.invalid/oauth/google/login?redirect=${
				encodeURIComponent(`${window.location.origin}/#/check-oauth?redirect=${encodeURIComponent(redirect)}`)
			}`,
		);
	});

	it('drops the href when disabled, but stays focusable and announced', () => {
		render(<GoogleAuthenticationButton text="Sign up with Google" disabled />);
		const link = screen.getByRole('link');
		expect(link.hasAttribute('href')).toBe(false);
		expect(link.getAttribute('aria-disabled')).toBe('true');
		expect(link.getAttribute('tabindex')).toBe('0');
	});
});
