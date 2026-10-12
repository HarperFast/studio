// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

const ORGANIZATION_ID = 'org-qmvwv3tdm45a9d4a';
const DEEP_LINK = `/${ORGANIZATION_ID}/settings`;
const cloudUser = { id: 'usr_a', email: 'a@example.com', roles: {} };

const { errorPageRendered, pageQueryFn, routers } = vi.hoisted(() => ({
	errorPageRendered: vi.fn(),
	pageQueryFn: vi.fn(),
	routers: new Set<{ history: { destroy: () => void }; state: { matches: { status: string }[] } }>(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }));
vi.mock('@tanstack/react-router-devtools', () => ({ TanStackRouterDevtools: () => null }));
vi.mock('@/features/notifications/NotificationsSubscriptionManager', () => ({
	NotificationsSubscriptionManager: () => null,
}));
vi.mock('@/components/NotificationBanner', () => ({ NotificationBanner: () => null }));
vi.mock('@/components/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/features/search/GlobalSearch', () => ({
	GlobalSearch: ({ children }: { children: unknown }) => children,
	GlobalSearchTrigger: () => null,
}));
vi.mock('@/components/ErrorComponent', () => ({
	ErrorComponent: () => {
		errorPageRendered();
		return <p>route error</p>;
	},
}));

/**
 * Mocks whose factories import app modules. A `vi.mock` factory's result outlives `resetModules`, so
 * these are registered again after each reset, or a test would run on the previous test's modules.
 */
function mockAppModules() {
	vi.doMock('@/integrations/datadog/datadog', async (importOriginal) => ({
		...await importOriginal<typeof import('@/integrations/datadog/datadog')>(),
		useOnRouteLoadTracker: () => undefined,
	}));
	// The real hook, recorded so each test can take its hash history down: one left behind would answer
	// the next test's location change.
	vi.doMock('@/router/useNewRouter', async (importOriginal) => {
		const { useNewRouter } = await importOriginal<typeof import('@/router/useNewRouter')>();
		return {
			useNewRouter: (...args: Parameters<typeof useNewRouter>) => {
				const router = useNewRouter(...args);
				routers.add(router);
				return router;
			},
		};
	});
	// The real root, dashboard and organization routes; only the leaf pages are stand-ins.
	vi.doMock('@/router/rootRouteTree', async () => {
		const { createRoute } = await import('@tanstack/react-router');
		const { useQuery } = await import('@tanstack/react-query');
		const { useCloudAuth } = await import('@/hooks/useAuth');
		const { rootRoute } = await import('@/router/rootRoute');
		const { dashboardLayout } = await import('@/router/dashboardRoute');
		const { orgsLayoutRoute } = await import('@/features/organizations/routes');
		const { orgLayoutRoute } = await import('@/features/organization/routes');

		function SettingsPage() {
			// Like every page reading its permissions off the signed-in user, this re-renders on sign-out.
			useCloudAuth();
			const { data } = useQuery({ queryKey: ['page-data'], queryFn: pageQueryFn, retry: false });
			return <p>{data ?? 'loading page'}</p>;
		}
		const settingsRoute = createRoute({
			getParentRoute: () => orgLayoutRoute,
			path: '/settings',
			component: SettingsPage,
		});
		const signInRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/sign-in',
			component: () => <p>sign-in page</p>,
		});
		return {
			rootRouteTree: rootRoute.addChildren([
				signInRoute,
				dashboardLayout.addChildren([orgsLayoutRoute.addChildren([orgLayoutRoute.addChildren([settingsRoute])])]),
			]),
		};
	});
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
	const response = { status, statusText: String(status), data, headers: {}, config };
	if (status < 300) {
		return response;
	}
	throw new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_RESPONSE,
		config,
		undefined,
		response,
	);
}

/**
 * A page load on `DEEP_LINK` with a remembered app sign-in, through the real `AppRouted` and wired as
 * `main.tsx` wires it, against a central manager whose answers the test chooses. The store reads its
 * markers at construction, so the modules are fresh.
 */
async function openDeepLink(answers: { userCurrent: Promise<number>; organization: number | Promise<number> }) {
	vi.resetModules();
	mockAppModules();
	const [{ apiClient }, { installApiUnauthorizedRedirect }, { queryClient }, { AppRouted }] = await Promise.all([
		import('@/config/apiClient'),
		import('@/lib/installApiUnauthorizedRedirect'),
		import('@/react-query/queryClient'),
		import('@/AppRouted'),
	]);
	const requests: string[] = [];
	apiClient.defaults.adapter = async (config) => {
		requests.push(config.url ?? '');
		if (config.url === '/User/current') {
			return respond(config, await answers.userCurrent, cloudUser);
		}
		if (config.url === `/Organization/${ORGANIZATION_ID}`) {
			return respond(config, await answers.organization, { id: ORGANIZATION_ID, name: 'Acme' });
		}
		throw new Error(`unexpected request ${config.url}`);
	};
	installApiUnauthorizedRedirect();
	render(
		<QueryClientProvider client={queryClient}>
			<AppRouted />
		</QueryClientProvider>,
	);
	return { requests };
}

/** Whether the page load has recorded a route's failure, which is what a route error page renders from. */
function routeLoadFailed() {
	return [...routers].some((router) => router.state.matches.some((match) => match.status === 'error'));
}

let consoleError: MockInstance<Console['error']>;

// 403s only: the sign-in check logs its own 401, which `shouldKeepEvent` keeps out of RUM.
function reportedAuthorizationFailures() {
	return consoleError.mock.calls.filter(([error]) => error instanceof AxiosError && error.response?.status === 403);
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn' }));
	window.location.hash = `#${DEEP_LINK}`;
	pageQueryFn.mockResolvedValue('page data');
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	for (const router of routers) {
		router.history.destroy();
	}
	routers.clear();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('route data that fails on a session that has ended', () => {
	it('lands on sign-in without rendering the route error when the data 403s before the sign-in check 401s', async () => {
		let answerUserCurrent: (status: number) => void = () => undefined;
		await openDeepLink({
			userCurrent: new Promise((resolve) => (answerUserCurrent = resolve)),
			organization: 403,
		});
		// Central manager answers the route's request first, while the sign-in check is still out.
		await waitFor(() => expect(routeLoadFailed()).toBe(true));

		answerUserCurrent(401);

		await screen.findByText('sign-in page');
		expect(errorPageRendered).not.toHaveBeenCalled();
	});

	it('reports nothing when the sign-in check 401s first and the data 403s after the sign-out', async () => {
		let answerOrganization: (status: number) => void = () => undefined;
		const { requests } = await openDeepLink({
			userCurrent: Promise.resolve(401),
			organization: new Promise((resolve) => (answerOrganization = resolve)),
		});
		await screen.findByText('sign-in page');
		expect(requests).toContain(`/Organization/${ORGANIZATION_ID}`);

		answerOrganization(403);
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(errorPageRendered).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(reportedAuthorizationFailures()).toEqual([]);
	});

	it('shows the route error once the session turns out to be live', async () => {
		let answerUserCurrent: (status: number) => void = () => undefined;
		await openDeepLink({
			userCurrent: new Promise((resolve) => (answerUserCurrent = resolve)),
			organization: 403,
		});
		await waitFor(() => expect(routeLoadFailed()).toBe(true));
		expect(errorPageRendered).not.toHaveBeenCalled();

		answerUserCurrent(200);

		await screen.findByText('route error');
	});

	it('unmounts the page instead of letting it re-fetch on the ended session', async () => {
		await openDeepLink({ userCurrent: Promise.resolve(200), organization: 200 });
		await screen.findByText('page data');
		expect(pageQueryFn).toHaveBeenCalledOnce();

		// What the central manager 401 interceptor runs when the session ends under an open page.
		const { clearAuthStateLocally } = await import('@/features/auth/handlers/clearAuthStateLocally');
		clearAuthStateLocally();

		await screen.findByText('sign-in page');
		expect(pageQueryFn).toHaveBeenCalledOnce();
		expect(errorPageRendered).not.toHaveBeenCalled();
	});
});
