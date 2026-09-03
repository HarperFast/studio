/**
 * @vitest-environment jsdom
 */
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

// One router object for the whole file, matching production's stable one.
const { navigate, router } = vi.hoisted(() => ({ navigate: vi.fn(), router: { invalidate: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigate,
	useRouter: () => router,
	useSearch: () => ({}),
	Link: ({ children, ...rest }: PropsWithChildren<{ className?: string }>) => <a {...rest}>{children}</a>,
}));

vi.mock('sonner', () => ({
	toast: { info: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/datadog/datadog', () => ({ loginSuccessDatadogAction: vi.fn() }));
vi.mock('@/integrations/reo/reo', () => ({ reoClient: { identify: vi.fn() } }));

import { toast } from 'sonner';
// The app's own routing, not a copy: whether the failure ALSO reaches the global toast is part of
// what's under test, so restating `skipGlobalErrorToast` here would let these pass regardless.
import { mutationErrorHandler } from '@/react-query/queryClient';
import { SERVER_ERROR_MESSAGE, SERVER_UNAVAILABLE_MESSAGE } from './describeAuthFailure';
import { SignIn } from './SignIn';

function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, code: 'ERR_BAD_RESPONSE', response: { status, data } } as AxiosError;
}

let queryClient: QueryClient;

function renderSignIn() {
	return render(
		<QueryClientProvider client={queryClient}>
			<SignIn />
		</QueryClientProvider>,
	);
}

function fillValidForm() {
	fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
}

function submit() {
	fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

beforeEach(() => {
	queryClient = new QueryClient({
		mutationCache: new MutationCache({ onError: mutationErrorHandler }),
		defaultOptions: { mutations: { retry: false } },
	});
	localStorage.clear();
});

afterEach(() => vi.clearAllMocks());

describe('SignIn', () => {
	it("reports the server's reason in the form rather than a toast", async () => {
		post.mockRejectedValue(axiosError(401, { error: 'Invalid email or password' }));

		renderSignIn();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid email or password'));
		expect(toast.error).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('says a bodyless 503 is worth reattempting, instead of a generic shrug', async () => {
		post.mockRejectedValue(axiosError(503));

		renderSignIn();
		fillValidForm();
		submit();

		await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(SERVER_UNAVAILABLE_MESSAGE));
	});

	it('clears the previous failure when the form is resubmitted', async () => {
		post.mockRejectedValueOnce(axiosError(503));

		renderSignIn();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

		post.mockResolvedValueOnce({ data: { id: 'usr-1', email: 'ada@example.com', roles: {} } });
		submit();

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).toBeNull();
	});

	// `curryRetryGatewayErrors` retries 502/503/504 only, so a 500 must not promise that waiting
	// helps — it offers a way to escalate instead.
	it('offers support for a 500 rather than promising a retry helps', async () => {
		post.mockRejectedValue(axiosError(500));

		renderSignIn();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(alert.textContent).toContain(SERVER_ERROR_MESSAGE);
		expect(alert.textContent).toContain('if this keeps happening');
	});

	it('does not offer support for a 503, which waiting can clear', async () => {
		post.mockRejectedValue(axiosError(503));

		renderSignIn();
		fillValidForm();
		submit();

		const alert = await waitFor(() => screen.getByRole('alert'));
		expect(alert.textContent).toBe(SERVER_UNAVAILABLE_MESSAGE);
	});

	it('shows no failure line before a submission fails', () => {
		renderSignIn();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('drops the previous failure on a resubmit the resolver rejects', async () => {
		post.mockRejectedValue(axiosError(401, { error: 'Invalid email or password' }));

		renderSignIn();
		fillValidForm();
		submit();
		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Invalid email or password'));

		fireEvent.change(screen.getByLabelText('Password'), { target: { value: '' } });
		submit();

		await waitFor(() => expect(screen.getByText('Please enter your password.')).toBeTruthy());
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
