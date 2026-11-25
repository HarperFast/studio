/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeSignUpBrowserProof } from './signUpBrowserProof';

vi.mock('@/components/StudioCloud', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { StudioCloud: Outlet };
});
vi.mock('@/features/auth/AuthLayout', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { AuthLayout: Outlet };
});

// The links central-manager emails, `#/verify-email?token=…` and `#/reset-password?token=…`, opened in the app's
// own router and its real pages. Every token below but the JWT is valid JSON, which the router's default parse alters.
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
const TOKENS = ['12345678901234567890', '1e5', 'true', 'null', '0', JWT];

let router: ReturnType<typeof useNewRouter> | undefined;

function App({ client }: { client: QueryClient }) {
	router = useNewRouter({});
	return (
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}

function open(hash: string) {
	window.location.hash = hash;
	render(<App client={new QueryClient()} />);
}

let put: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	put = vi.spyOn(apiClient, 'put').mockReturnValue(new Promise(() => {}));
	// The router's scroll restoration calls it, and jsdom only logs that it can't.
	vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	// A hash history patches `window.history`; one left behind would answer the next test's navigation.
	router?.history.destroy();
	router = undefined;
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('a reset-password link', () => {
	it.each(TOKENS)('sends the token %j exactly as the link spells it', async (token) => {
		open(`#/reset-password?token=${encodeURIComponent(token)}`);
		const password = await screen.findByLabelText('New Password');

		await act(async () => {
			fireEvent.change(password, { target: { value: 'a-strong-password-1' } });
			fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'a-strong-password-1' } });
			fireEvent.click(screen.getByRole('button', { name: 'Submit New Password' }));
		});

		await waitFor(() =>
			expect(put).toHaveBeenCalledExactlyOnceWith('/ResetPassword/', { token, newPassword: 'a-strong-password-1' })
		);
		expect(window.location.hash).toBe(`#/reset-password?token=${encodeURIComponent(token)}`);
	});

	// The router writes this URL back itself, to drop the trailing slash.
	it('keeps the token when the router rewrites the address', async () => {
		open('#/reset-password/?token=0');
		await screen.findByLabelText('New Password');

		await waitFor(() => expect(window.location.hash).toBe('#/reset-password?token=0'));
	});
});

describe('a verify-email link', () => {
	beforeEach(() => storeSignUpBrowserProof('browser-proof', 'ada@example.com'));

	it.each(TOKENS)('sends the token %j exactly as the link spells it', async (token) => {
		open(`#/verify-email?token=${encodeURIComponent(token)}`);

		await waitFor(() =>
			expect(put).toHaveBeenCalledExactlyOnceWith('/VerifyEmail/', { token, browserProof: 'browser-proof' })
		);
	});

	// A flow id is 22 to 64 base64url characters, so one can be all digits.
	it('keeps a flow id that reads as a number', async () => {
		const flow = '1234567890123456789012';
		open(`#/verify-email?token=${encodeURIComponent(JWT)}&flow=${flow}`);

		await waitFor(() =>
			expect(put).toHaveBeenCalledExactlyOnceWith('/VerifyEmail/', {
				token: JWT,
				browserProof: 'browser-proof',
				flow,
			})
		);
	});
});
