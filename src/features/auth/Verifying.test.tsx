/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { search, historyState, resend } = vi.hoisted(() => ({
	search: {} as { email?: string; redirect?: unknown },
	historyState: {} as { prefillEmail?: string },
	resend: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => search,
	useLocation: ({ select }: { select: (location: { state: typeof historyState }) => unknown }) =>
		select({ state: historyState }),
	Link: ({ children, to, search, state, onClick }: PropsWithChildren<
		{
			to?: string;
			search?: { redirect?: string };
			state?: { prefillEmail?: string };
			onClick?: (event: unknown) => void;
		}
	>) => (
		<a
			href={to ?? '#'}
			data-redirect={search?.redirect}
			data-prefill-email={state?.prefillEmail}
			onClick={onClick}
		>
			{children}
		</a>
	),
}));
vi.mock('./hooks/useResendEmailVerification', () => ({
	useResendEmailVerification: () => ({ mutate: resend, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), dismiss: vi.fn() } }));

import { readSignInRedirect } from './pendingSignInRedirect';
import { Verifying } from './Verifying';

afterEach(() => {
	delete search.email;
	delete search.redirect;
	delete historyState.prefillEmail;
	vi.clearAllMocks();
	localStorage.clear();
});

describe('Verifying', () => {
	it('uses the address it was handed in history state, and hands it on to sign-in the same way', () => {
		historyState.prefillEmail = 'ada@example.com';
		render(<Verifying />);

		expect(screen.getByText('ada@example.com')).toBeTruthy();
		const signIn = screen.getByRole('link', { name: 'I did it, let me sign in!' });
		expect(signIn.getAttribute('href')).toBe('/sign-in');
		expect(signIn.getAttribute('data-prefill-email')).toBe('ada@example.com');

		fireEvent.click(screen.getByRole('link', { name: 'Send me another code, please.' }));
		expect(resend).toHaveBeenCalledWith({ email: 'ada@example.com' }, expect.anything());
	});

	// Links and bookmarks made before the address moved out of the URL.
	it('still reads an address from ?email=', () => {
		search.email = 'grace@example.com';
		render(<Verifying />);

		expect(screen.getByText('grace@example.com')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'I did it, let me sign in!' }).getAttribute('data-prefill-email')).toBe(
			'grace@example.com',
		);
	});

	it('resends nothing without an address', () => {
		render(<Verifying />);

		expect(screen.getByText('your email')).toBeTruthy();
		fireEvent.click(screen.getByRole('link', { name: 'Send me another code, please.' }));
		expect(resend).not.toHaveBeenCalled();
	});
});

describe('Verifying — redirect', () => {
	it('hands a redirect to follow on to sign-in', () => {
		search.redirect = '/oauth/mcp/authorize?response_type=code&client_id=c';
		render(<Verifying />);

		expect(screen.getByRole('link', { name: 'I did it, let me sign in!' }).dataset.redirect).toBe(
			'/oauth/mcp/authorize?response_type=code&client_id=c',
		);
	});

	// The first link's record may have expired while this page stayed open.
	it('keeps the target under a new flow the new link names', () => {
		historyState.prefillEmail = 'ada@example.com';
		search.redirect = '/oauth/mcp/authorize?response_type=code&client_id=c';
		render(<Verifying />);

		fireEvent.click(screen.getByRole('link', { name: 'Send me another code, please.' }));

		const { flow } = resend.mock.calls[0][0];
		expect(resend).toHaveBeenCalledWith({ email: 'ada@example.com', flow }, expect.anything());
		expect(readSignInRedirect(flow)?.redirect).toBe('/oauth/mcp/authorize?response_type=code&client_id=c');
	});

	it('hands on none it would not follow', () => {
		search.redirect = 'https://evil.example/oauth/mcp/authorize';
		render(<Verifying />);

		expect(screen.getByRole('link', { name: 'I did it, let me sign in!' }).dataset.redirect).toBeUndefined();
	});
});
