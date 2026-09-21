/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pending: false, mutate: vi.fn(), navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	useSearch: () => ({}),
	useNavigate: () => state.navigate,
	Link: ({ children, to }: PropsWithChildren<{ to?: string }>) => <a href={to || '#'}>{children}</a>,
}));
vi.mock('./hooks/useVerifyEmail', () => ({
	useVerifyEmailMutation: () => ({ mutate: state.mutate, isPending: state.pending }),
}));
vi.mock('./hooks/useResendEmailVerification', () => ({
	useResendEmailVerification: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('./queries/getCurrentUser', () => ({
	currentUserQueryKey: ['currentUser'],
	getCurrentUser: () => new Promise(() => {}),
}));
vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));
import { CheckOAuth } from './CheckOAuth';
import { VerifyEmail } from './VerifyEmail';
import { Verifying } from './Verifying';

afterEach(() => {
	state.pending = false;
	vi.clearAllMocks();
});

describe('verification screens', () => {
	it('announces the OAuth handoff while the session check is pending', () => {
		render(<CheckOAuth />);
		expect(screen.getByRole('status').textContent).toContain('Checking...');
		expect(screen.getByRole('link', { name: 'Try signing in again' }).getAttribute('href')).toBe('/sign-in');
	});

	it('keeps the email field accessible and focused in the shared input wrapper', async () => {
		render(<VerifyEmail />);
		const input = screen.getByLabelText('Email');
		expect(input.getAttribute('placeholder')).toBe('you@company.com');
		expect(input.getAttribute('autocomplete')).toBe('email');
		await waitFor(() => expect(document.activeElement).toBe(input));
		expect(state.mutate).not.toHaveBeenCalled();
	});

	it('announces verification in progress instead of exposing the resend form', () => {
		state.pending = true;
		render(<VerifyEmail />);
		expect(screen.getByRole('status').textContent).toBe('Verifying email...');
		expect(screen.queryByLabelText('Email')).toBeNull();
	});

	it('keeps the check-your-email instructions and return path available without resending on mount', () => {
		render(<Verifying />);
		expect(screen.getByRole('heading', { name: 'Check your email!' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'I did it, let me sign in!' }).getAttribute('href')).toBe('/sign-in');
		expect(state.mutate).not.toHaveBeenCalled();
	});
});
