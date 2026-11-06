/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { search, historyState, resend } = vi.hoisted(() => ({
	search: {} as { email?: string },
	historyState: {} as { prefillEmail?: string },
	resend: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => search,
	useLocation: ({ select }: { select: (location: { state: typeof historyState }) => unknown }) =>
		select({ state: historyState }),
	Link: ({ children, to, state, onClick }: PropsWithChildren<
		{ to?: string; state?: { prefillEmail?: string }; onClick?: (event: unknown) => void }
	>) => <a href={to ?? '#'} data-prefill-email={state?.prefillEmail} onClick={onClick}>{children}</a>,
}));
vi.mock('./hooks/useResendEmailVerification', () => ({
	useResendEmailVerification: () => ({ mutate: resend, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), dismiss: vi.fn() } }));

import { Verifying } from './Verifying';

afterEach(() => {
	delete search.email;
	delete historyState.prefillEmail;
	vi.clearAllMocks();
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
