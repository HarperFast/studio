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

	it('links to the central-manager login endpoint', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		render(<GitHubAuthenticationButton text="Sign in with GitHub" />);
		expect(screen.getByRole('link').getAttribute('href')).toBe(
			'https://cm.test.invalid/oauth/github/login?redirect=%2F%23%2Fcheck-oauth',
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
