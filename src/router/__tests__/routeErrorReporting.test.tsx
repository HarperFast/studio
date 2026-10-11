/**
 * @vitest-environment jsdom
 */
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { orgLayoutRoute } from '@/features/organization/routes';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { reactRootErrorHandlers } from '@/integrations/datadog/reportReactError';
import { queryClient } from '@/react-query/queryClient';
import { dashboardLayout } from '@/router/dashboardRoute';
import { rootRoute } from '@/router/rootRoute';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoute, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { get, addReactError, signedIn } = vi.hoisted(() => ({
	get: vi.fn(),
	addReactError: vi.fn(),
	signedIn: { isLoading: false, user: { id: 'usr-1', roles: {} } },
}));

vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));
vi.mock('@datadog/browser-rum-react', () => ({ addReactError }));
vi.mock('@/hooks/useAuth', async (importOriginal) => ({
	...await importOriginal<typeof import('@/hooks/useAuth')>(),
	useOverallAuth: () => signedIn,
}));
vi.mock('@/components/StudioCloud', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { StudioCloud: Outlet };
});
vi.mock('@/features/layouts/Dashboard', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { Dashboard: Outlet };
});

// The production chain down to the org layout, with a light page in place of its real children.
const orgHomeRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/',
	component: () => <p>organization loaded</p>,
});
const routeTree = rootRoute.addChildren([
	dashboardLayout.addChildren([orgsLayoutRoute.addChildren([orgLayoutRoute.addChildren([orgHomeRoute])])]),
]);

function httpError(url: string, status: number) {
	const config = { headers: new AxiosHeaders(), url, method: 'get' } as InternalAxiosRequestConfig;
	return new AxiosError(
		`Request failed with status code ${status}`,
		status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
		config,
		{},
		{ status, statusText: '', data: {}, headers: {}, config },
	);
}

let router: ReturnType<typeof useNewRouter>;
function App() {
	router = useNewRouter({ routeTree: routeTree as never, authentication: { [OverallAppSignIn]: signedIn } as never });
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}

function openOrganization(organizationId: string) {
	window.location.hash = `#/${organizationId}`;
	render(<App />, { onCaughtError: reactRootErrorHandlers.onCaughtError });
}

afterEach(() => {
	cleanup();
	queryClient.clear();
	get.mockReset();
	addReactError.mockReset();
	vi.restoreAllMocks();
});

describe('route error reporting', () => {
	it('reports a failed route load to RUM once, through re-catches and reloads, and never as a console error', async () => {
		const consoleError = vi.spyOn(console, 'error');
		get.mockImplementation(async (url: string) => {
			throw httpError(url, 403);
		});
		openOrganization('org-forbidden');
		await screen.findByRole('heading', { name: 'No Access to This Organization' }, { timeout: 5000 });
		await act(() => router.invalidate());
		await act(() => router.invalidate());

		expect(get.mock.calls.length).toBeGreaterThan(1);
		expect(addReactError).toHaveBeenCalledTimes(1);
		const rootHandlerLogs = consoleError.mock.calls.filter(([first]) =>
			typeof first === 'string' && first.endsWith('error:')
		);
		expect(rootHandlerLogs).toEqual([]);
	});

	it('offers Try Again for a server error and shows the page once a reload succeeds', async () => {
		let serverUp = false;
		get.mockImplementation(async (url: string) => {
			if (!serverUp) { throw httpError(url, 503); }
			return { data: { id: 'org-flaky', name: 'Flaky', clusters: [] } };
		});
		openOrganization('org-flaky');
		await screen.findByRole('heading', { name: 'Something Went Wrong' }, { timeout: 5000 });
		expect(screen.getByText(/couldn't load this \(error 503\)/)).toBeTruthy();
		const failedReads = get.mock.calls.length;

		serverUp = true;
		fireEvent.click(screen.getByRole('button', { name: /Try Again/ }));

		expect(await screen.findByText('organization loaded')).toBeTruthy();
		expect(get.mock.calls.length).toBeGreaterThan(failedReads);
		expect(screen.queryByTestId('error-component')).toBeNull();
	});

	it('offers no Try Again for a 403, which a reload cannot fix', async () => {
		get.mockImplementation(async (url: string) => {
			throw httpError(url, 403);
		});
		openOrganization('org-denied');
		await screen.findByRole('heading', { name: 'No Access to This Organization' }, { timeout: 5000 });

		expect(screen.queryByRole('button', { name: /Try Again/ })).toBeNull();
	});
});
