/**
 * @vitest-environment jsdom
 */
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { orgLayoutRoute } from '@/features/organization/routes';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { queryClient } from '@/react-query/queryClient';
import { dashboardLayout } from '@/router/dashboardRoute';
import { ensureRouteQueryData } from '@/router/ensureRouteQueryData';
import { rootRoute } from '@/router/rootRoute';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import type { ErrorInfo } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

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

/** The RUM report the root `onCaughtError` files for what a route error boundary catches; how else the handler logs is its own concern. */
const onCaughtError = (error: unknown, errorInfo: ErrorInfo) => addReactError(error, errorInfo);

function OrgHome() {
	const { organizationId } = orgLayoutRoute.useParams();
	const { data } = useQuery(getOrganizationQueryOptions(organizationId));
	return <p>{data?.name} loaded</p>;
}

// The production chain down to the org layout, with light pages in place of its real children.
const orgHomeRoute = createRoute({ getParentRoute: () => orgLayoutRoute, path: '/', component: OrgHome });
const elsewhereRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/elsewhere',
	component: () => <p>elsewhere</p>,
});
const routeTree = rootRoute.addChildren([
	dashboardLayout.addChildren([
		orgsLayoutRoute.addChildren([orgLayoutRoute.addChildren([orgHomeRoute]), elsewhereRoute]),
	]),
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

function deferredGet() {
	let fail: (status: number) => void = () => undefined;
	get.mockImplementation((url: string) =>
		new Promise((_resolve, reject) => {
			fail = (status) => reject(httpError(url, status));
		})
	);
	return { fail: (status: number) => fail(status) };
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

function open(hash: string) {
	window.location.hash = hash;
	render(<App />, { onCaughtError });
}

const toOrganization = (organizationId: string) => ({ to: '/$organizationId', params: { organizationId } }) as never;

let consoleError: MockInstance<Console['error']>;
/** What React Query's global handler reported: it hands RUM the raw failure, alone. */
const reportedByQueryCache = () => consoleError.mock.calls.filter(([first]) => first instanceof AxiosError);
const caught = () => addReactError.mock.calls.map(([error]) => error);

beforeEach(() => {
	consoleError = vi.spyOn(console, 'error');
	vi.spyOn(toast, 'error');
});

afterEach(() => {
	cleanup();
	queryClient.clear();
	get.mockReset();
	addReactError.mockReset();
	vi.restoreAllMocks();
});

describe('a failed route load', () => {
	it('is reported by the route boundary alone, with no toast, through reloads of the route', async () => {
		get.mockImplementation(async (url: string) => {
			throw httpError(url, 403);
		});
		open('#/org-forbidden');
		await waitFor(() => expect(addReactError).toHaveBeenCalled(), { timeout: 5000 });
		await act(() => router.invalidate());
		await act(() => router.invalidate());

		expect(get.mock.calls.length).toBeGreaterThan(1);
		expect(caught().every((error) => error instanceof AxiosError && error.response?.status === 403)).toBe(true);
		expect(reportedByQueryCache()).toEqual([]);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('is reported by the boundary alone when the click lands while its hover preload is still reading', async () => {
		open('#/elsewhere');
		await screen.findByText('elsewhere');
		const read = deferredGet();
		void router.preloadRoute(toOrganization('org-hovered'));
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
		const navigation = router.navigate(toOrganization('org-hovered'));
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

		await act(async () => {
			read.fail(403);
			await navigation;
		});
		await waitFor(() => expect(addReactError).toHaveBeenCalled());

		expect(get).toHaveBeenCalledTimes(1);
		expect(reportedByQueryCache()).toEqual([]);
		expect(toast.error).not.toHaveBeenCalled();
	});
});

describe('a query failure no route renders', () => {
	it('still toasts and reports when a hover preload fails and nobody clicks', async () => {
		open('#/elsewhere');
		await screen.findByText('elsewhere');
		get.mockImplementation(async (url: string) => {
			throw httpError(url, 403);
		});

		await act(async () => {
			await router.preloadRoute(toOrganization('org-hovered'));
		});

		expect(reportedByQueryCache()).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(addReactError).not.toHaveBeenCalled();
	});

	it('still toasts and reports when the user left before the load failed', async () => {
		open('#/elsewhere');
		await screen.findByText('elsewhere');
		const read = deferredGet();
		void router.navigate(toOrganization('org-slow'));
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
		await act(() => router.navigate({ to: '/elsewhere' } as never));

		await act(async () => {
			read.fail(500);
			await new Promise((resolve) => setTimeout(resolve, 10));
		});

		expect(screen.getByText('elsewhere')).toBeTruthy();
		expect(reportedByQueryCache()).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(addReactError).not.toHaveBeenCalled();
	});

	it('still toasts and reports when a background refetch fails on a page that rendered', async () => {
		get.mockResolvedValue({ data: { id: 'org-ok', name: 'Acme', clusters: [] } });
		open('#/org-ok');
		await screen.findByText('Acme loaded', {}, { timeout: 5000 });
		get.mockImplementation(async (url: string) => {
			throw httpError(url, 500);
		});

		await act(() => queryClient.invalidateQueries({ queryKey: ['org-ok'] }));

		expect(screen.getByText('Acme loaded')).toBeTruthy();
		expect(reportedByQueryCache()).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(addReactError).not.toHaveBeenCalled();
	});
});

describe('a failed loader read', () => {
	const loaderRoot = createRootRouteWithContext<{ queryClient: typeof queryClient }>()();
	const homeRoute = createRoute({ getParentRoute: () => loaderRoot, path: '/', component: () => <p>home</p> });
	const fetchData = vi.fn<() => Promise<string>>();
	const dataRoute = createRoute({
		getParentRoute: () => loaderRoot,
		path: 'data',
		loader: (opts) => ensureRouteQueryData(opts, { queryKey: ['loader-data'], queryFn: fetchData, retry: false }),
		component: () => <p>data</p>,
	});

	function openLoaderRouter() {
		const loaderRouter = createRouter({
			routeTree: loaderRoot.addChildren([homeRoute, dataRoute]),
			history: createMemoryHistory({ initialEntries: ['/'] }),
			context: { queryClient },
			defaultPreloadStaleTime: 0,
		});
		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={loaderRouter} />
			</QueryClientProvider>,
			{ onCaughtError },
		);
		return loaderRouter;
	}

	function failNextRead(status: number) {
		const failure = new Error(`Request failed with status code ${status}`);
		let fail: () => void = () => undefined;
		fetchData.mockReset().mockReturnValue(
			new Promise((_resolve, reject) => {
				fail = () => reject(failure);
			}),
		);
		return { failure, fail: () => fail() };
	}

	const reportedByQueryCacheAs = (failure: Error) => consoleError.mock.calls.filter(([first]) => first === failure);

	it('is reported by the boundary alone when the navigation runs the loader', async () => {
		const loaderRouter = openLoaderRouter();
		await screen.findByText('home');
		const read = failNextRead(503);
		const navigation = loaderRouter.navigate({ to: '/data' });
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

		await act(async () => {
			read.fail();
			await navigation;
		});
		await waitFor(() => expect(caught()).toContain(read.failure));

		expect(reportedByQueryCacheAs(read.failure)).toEqual([]);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('still toasts and reports when only a hover preload read it and nobody clicks', async () => {
		const loaderRouter = openLoaderRouter();
		await screen.findByText('home');
		const read = failNextRead(502);

		await act(async () => {
			const preload = loaderRouter.preloadRoute({ to: '/data' });
			read.fail();
			await preload;
		});

		expect(reportedByQueryCacheAs(read.failure)).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(addReactError).not.toHaveBeenCalled();
	});

	it('is still reported twice when the navigation adopts the loader its hover preload has in flight', async () => {
		const loaderRouter = openLoaderRouter();
		await screen.findByText('home');
		const read = failNextRead(504);
		void loaderRouter.preloadRoute({ to: '/data' });
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
		const navigation = loaderRouter.navigate({ to: '/data' });
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

		await act(async () => {
			read.fail();
			await navigation;
		});
		await waitFor(() => expect(caught()).toContain(read.failure));

		expect(fetchData).toHaveBeenCalledTimes(1);
		expect(reportedByQueryCacheAs(read.failure)).toHaveLength(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
	});
});
