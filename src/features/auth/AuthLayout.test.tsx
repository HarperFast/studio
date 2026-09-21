/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	Outlet: () => <div>Authentication form</div>,
	Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
}));
import { ThemeProvider } from '@/hooks/useTheme';
import { AuthLayout } from './AuthLayout';

afterEach(() => {
	document.documentElement.classList.remove('dark');
});

describe('shared cloud authentication layout', () => {
	it('follows the explicit light and dark theme choices for the artwork', async () => {
		render(
			<ThemeProvider>
				<AuthLayout />
			</ThemeProvider>,
		);
		const artwork = screen.getByAltText(
			'App, database, cache, and messaging together on a globally distributed platform.',
		);
		fireEvent.click(screen.getByTitle('Light'));
		await waitFor(() => expect(artwork.getAttribute('src')).toBe('/auth/fabric-hero-light.png'));
		fireEvent.click(screen.getByTitle('Dark'));
		await waitFor(() => expect(artwork.getAttribute('src')).toBe('/auth/fabric-hero-dark.png'));
	});

	it('renders the active authentication form in the shared account card', () => {
		render(<AuthLayout />);
		expect(screen.getByRole('heading', { name: /One runtime\.\s*Endless possibilities\./ })).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Account access' }).textContent).toContain('Authentication form');
	});
});
