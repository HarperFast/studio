// @vitest-environment jsdom
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

const ORGANIZATION_ID = 'org-qmvwv3tdm45a9d4a';
const CLUSTER_ID = 'clu-crosstab';
const PAGE = `/${ORGANIZATION_ID}/cluster`;
const cloudUser = { id: 'usr_a', email: 'a@example.com', roles: {} };

const { routers } = vi.hoisted(() => ({
	routers: new Set<{ history: { destroy: () => void } }>(),
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
vi.mock('@/features/auth/AuthLayout', async () => {
	const { Outlet } = await import('@tanstack/react-router');
	return { AuthLayout: () => <Outlet /> };
});
vi.mock('@/features/auth/SignIn', () => ({ SignIn: () => <p>sign-in page</p> }));

/** Registered again after each `resetModules`, which a `vi.mock` factory's result outlives. */
function mockAppModules() {
	vi.doMock('@/integrations/datadog/datadog', async (importOriginal) => ({
		...await importOriginal<typeof import('@/integrations/datadog/datadog')>(),
		useOnRouteLoadTracker: () => undefined,
	}));
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
	// The real root, sign-in, dashboard and organization routes, under a page that polls its cluster the way
	// the cluster pages do.
	vi.doMock('@/router/rootRouteTree', async () => {
		const { createRoute } = await import('@tanstack/react-router');
		const { useQuery } = await import('@tanstack/react-query');
		const { useCloudAuth } = await import('@/hooks/useAuth');
		const { getClusterInfoQueryOptions } = await import('@/features/cluster/queries/getClusterInfoQuery');
		const { rootRoute } = await import('@/router/rootRoute');
		const { authRouteTree } = await import('@/features/auth/routes');
		const { dashboardLayout } = await import('@/router/dashboardRoute');
		const { orgsLayoutRoute } = await import('@/features/organizations/routes');
		const { orgLayoutRoute } = await import('@/features/organization/routes');

		function ClusterPage() {
			useCloudAuth();
			const { data } = useQuery(getClusterInfoQueryOptions(CLUSTER_ID, true));
			return <p>{data ? `cluster ${data.name}` : 'loading cluster'}</p>;
		}
		const clusterRoute = createRoute({
			getParentRoute: () => orgLayoutRoute,
			path: '/cluster',
			component: ClusterPage,
		});
		return {
			rootRouteTree: rootRoute.addChildren([
				authRouteTree,
				dashboardLayout.addChildren([orgsLayoutRoute.addChildren([orgLayoutRoute.addChildren([clusterRoute])])]),
			]),
		};
	});
}

mockAppModules();
await Promise.all([import('@/lib/installApiUnauthorizedRedirect'), import('@/AppRouted')]);

/**
 * The central-manager session every tab shares through its cookie. Central manager answers a request with no
 * session 403 `Not allowed` (`checkUser` → `notAllowed()`, HarperFast/central-manager#938), exactly as it
 * answers one the user may not make; only `/User/current` says 401.
 */
let session: 'live' | 'ended' | 'ended-with-401' | 'cluster-forbidden';
const requests: string[] = [];
const requestsAfterSessionEnded: string[] = [];

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

function notAllowed(config: InternalAxiosRequestConfig) {
	return respond(config, 403, {
		type: 'error:ClientError',
		code: 'ClientError',
		title: 'Not allowed',
		status: 403,
		instance: config.url,
	});
}

function centralManager(config: InternalAxiosRequestConfig) {
	requests.push(config.url ?? '');
	if (session !== 'live' && session !== 'cluster-forbidden') {
		requestsAfterSessionEnded.push(config.url ?? '');
		return session === 'ended-with-401' || config.url === '/User/current'
			? respond(config, 401, { code: 'ClientError', title: 'Invalid cookie' })
			: notAllowed(config);
	}
	switch (config.url) {
		case '/User/current':
			return respond(config, 200, cloudUser);
		case `/Organization/${ORGANIZATION_ID}`:
			return respond(config, 200, { id: ORGANIZATION_ID, name: 'Acme' });
		case `/Cluster/${CLUSTER_ID}`:
			return session === 'cluster-forbidden'
				? notAllowed(config)
				: respond(config, 200, { id: CLUSTER_ID, name: 'Prod', status: 'RUNNING' });
	}
	throw new Error(`unexpected request ${config.url}`);
}

/** This tab: the cluster page, signed in, wired as `main.tsx` wires it. */
async function openClusterPage() {
	vi.resetModules();
	mockAppModules();
	const [
		{ apiClient },
		{ authStore },
		{ installApiUnauthorizedRedirect },
		{ installCrossTabSignOut },
		{ queryClient },
		{ AppRouted },
	] = await Promise.all([
		import('@/config/apiClient'),
		import('@/features/auth/store/authStore'),
		import('@/lib/installApiUnauthorizedRedirect'),
		import('@/lib/installCrossTabSignOut'),
		import('@/react-query/queryClient'),
		import('@/AppRouted'),
	]);
	apiClient.defaults.adapter = async (config) => centralManager(config);
	installApiUnauthorizedRedirect();
	installCrossTabSignOut();
	render(
		<QueryClientProvider client={queryClient}>
			<AppRouted />
		</QueryClientProvider>,
	);
	await screen.findByText('cluster Prod');
	return { authStore, queryClient };
}

type StorageChange = Pick<StorageEvent, 'key' | 'oldValue' | 'newValue'>;

/**
 * Another tab of the same browser, signed in as its page load would sign it in: its own copy of the app's
 * modules, sharing this tab's `localStorage` and central-manager session but not its `sessionStorage`.
 * `record` returns the changes `step` made to `localStorage`; `deliver` hands them to this tab as the
 * `storage` events a browser fires in every other tab; `run` does both.
 */
async function openAnotherTab() {
	vi.resetModules();
	const [{ authStore }, { apiClient }, { installApiUnauthorizedRedirect }, { logoutOnSuccess }, {
		clearAuthStateLocally,
	}] = await Promise.all([
		import('@/features/auth/store/authStore'),
		import('@/config/apiClient'),
		import('@/lib/installApiUnauthorizedRedirect'),
		import('@/features/auth/handlers/logoutOnSuccess'),
		import('@/features/auth/handlers/clearAuthStateLocally'),
	]);
	apiClient.defaults.adapter = async (config) => centralManager(config);
	installApiUnauthorizedRedirect();
	await authStore.reloadUser('OverallAppSignIn');
	const record = (step: () => unknown) => localStorageChanges(step);
	return {
		authStore,
		apiClient,
		logoutOnSuccess,
		clearAuthStateLocally,
		record,
		run: async (step: () => unknown) => deliver(await record(step)),
	};
}

function deliver(changes: StorageChange[]) {
	for (const change of changes) {
		window.dispatchEvent(new StorageEvent('storage', { ...change, storageArea: localStorage }));
	}
}

async function localStorageChanges(step: () => unknown): Promise<StorageChange[]> {
	const changes: StorageChange[] = [];
	const { clear, removeItem, setItem } = Storage.prototype;
	const spies = [
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
			if (this !== localStorage) {
				return;
			}
			const oldValue = this.getItem(key);
			setItem.call(this, key, value);
			if (oldValue !== value) {
				changes.push({ key, oldValue, newValue: value });
			}
		}),
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(this: Storage, key) {
			if (this !== localStorage) {
				return;
			}
			const oldValue = this.getItem(key);
			removeItem.call(this, key);
			if (oldValue !== null) {
				changes.push({ key, oldValue, newValue: null });
			}
		}),
		vi.spyOn(Storage.prototype, 'clear').mockImplementation(function(this: Storage) {
			if (this !== localStorage) {
				return;
			}
			const hadItems = this.length > 0;
			clear.call(this);
			if (hadItems) {
				changes.push({ key: null, oldValue: null, newValue: null });
			}
		}),
	];
	try {
		await step();
	} finally {
		for (const spy of spies) {
			spy.mockRestore();
		}
	}
	return changes;
}

/** This tab's next poll of its page data, as its 10s `refetchInterval` or a refocus would send it. */
async function nextPoll(queryClient: QueryClient) {
	await queryClient.refetchQueries({ type: 'active' });
	await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

/** Needs no wait: a sign-out reaches the store synchronously, and its cache clear leaves the next poll nothing to send. */
async function expectStillSignedIn(thisTab: Awaited<ReturnType<typeof openClusterPage>>, user: object = cloudUser) {
	expect(thisTab.authStore.getConnectionById('OverallAppSignIn').user).toEqual(user);
	const polled = requests.length;
	await nextPoll(thisTab.queryClient);
	expect(requests.slice(polled)).toContain(`/Cluster/${CLUSTER_ID}`);
	expect(screen.getByText('cluster Prod')).toBeTruthy();
	expect(toast.error).not.toHaveBeenCalled();
}

let consoleError: MockInstance<Console['error']>;

function reportedAuthorizationFailures() {
	return consoleError.mock.calls.filter(([error]) => error instanceof AxiosError && error.response?.status === 403);
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn' }));
	window.history.replaceState(null, '', `#${PAGE}`);
	session = 'live';
	requests.length = 0;
	requestsAfterSessionEnded.length = 0;
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

describe('a sign-out in another tab', () => {
	it('signs this tab out once that tab’s `/Logout/` succeeds, before its next poll can toast', async () => {
		const { queryClient } = await openClusterPage();
		const otherTab = await openAnotherTab();

		// What `useLogoutMutation` runs there: the sweep, central manager's `/Logout/`, then `logoutOnSuccess`.
		await otherTab.run(() => otherTab.authStore.signOutFromPotentiallyAuthenticatedInstances());
		session = 'ended';
		await otherTab.run(() => otherTab.logoutOnSuccess());
		// The poll, or the refocus, that toasted "ClientError: Not allowed" before.
		await nextPoll(queryClient);

		expect(toast.error).not.toHaveBeenCalled();
		expect(requestsAfterSessionEnded).toEqual([]);
		expect(reportedAuthorizationFailures()).toEqual([]);
		await screen.findByText('sign-in page');
	});

	it('leaves this tab signed in when that tab’s `/Logout/` fails', async () => {
		const thisTab = await openClusterPage();
		const otherTab = await openAnotherTab();

		// The sweep runs first; a failed `/Logout/` skips `logoutOnSuccess`, and the session stays live.
		await otherTab.run(() => otherTab.authStore.signOutFromPotentiallyAuthenticatedInstances());

		await expectStillSignedIn(thisTab);
	});

	it('signs this tab out when another tab found the session ended', async () => {
		const { queryClient } = await openClusterPage();
		const otherTab = await openAnotherTab();

		// The session expired; the other tab heard first, from a 401, and cleared it as the 401 handler does.
		session = 'ended';
		await otherTab.run(() => otherTab.clearAuthStateLocally());
		await nextPoll(queryClient);

		expect(toast.error).not.toHaveBeenCalled();
		expect(requestsAfterSessionEnded).toEqual([]);
		await screen.findByText('sign-in page');
	});

	it('leaves this tab signed in when a 401 in another tab ends a different user’s session', async () => {
		const thisTab = await openClusterPage();
		const otherTab = await openAnotherTab();
		// That tab still holds user U from before this tab signed in as the current user.
		otherTab.authStore.setUserForIdAndKey('OverallAppSignIn', 'OverallAppSignIn', { id: 'usr_u' } as never);
		otherTab.apiClient.defaults.adapter = async (config) =>
			respond(config, 401, { code: 'ClientError', title: 'Invalid cookie' });

		await otherTab.run(() =>
			otherTab.apiClient.get(`/Organization/${ORGANIZATION_ID}` as '/Organization/{id}').catch(() => undefined)
		);
		expect(otherTab.authStore.isKnownSignedOut('OverallAppSignIn')).toBe(true);

		await expectStillSignedIn(thisTab);
	});

	it('leaves this tab signed in when a sign-out reaches it after it signed in as someone else', async () => {
		const thisTab = await openClusterPage();
		const otherTab = await openAnotherTab();
		const signedInSince = { id: 'usr_v', email: 'v@example.com', roles: {} };

		const changes = [
			...await otherTab.record(() => otherTab.authStore.signOutFromPotentiallyAuthenticatedInstances()),
			...await otherTab.record(() => otherTab.logoutOnSuccess()),
		];
		thisTab.authStore.setUserForIdAndKey('OverallAppSignIn', 'OverallAppSignIn', signedInSince as never);
		deliver(changes);

		await expectStillSignedIn(thisTab, signedInSince);
	});

	it('leaves this tab signed in when another tab only signs in or out of a cluster', async () => {
		const thisTab = await openClusterPage();
		const otherTab = await openAnotherTab();

		await otherTab.run(() =>
			otherTab.authStore.setUserForIdAndKey('clu-other', 'https://clu-other.example.com', { username: 'u' } as never)
		);
		await otherTab.run(() => otherTab.authStore.signOutLocally('clu-other'));

		await expectStillSignedIn(thisTab);
	});

	it('leaves this tab signed in when another tab’s sign-in check merely fails', async () => {
		const thisTab = await openClusterPage();
		const otherTab = await openAnotherTab();
		// A reload during a central-manager blip: that tab reads the failed check as signed out, and drops the app
		// sign-in from the marker record both tabs share.
		otherTab.apiClient.defaults.adapter = async (config) => {
			throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config);
		};

		await otherTab.run(() => otherTab.authStore.reloadUser('OverallAppSignIn'));
		expect(localStorage.getItem('Studio:PotentiallyAuthenticated')).toBe('{}');

		await expectStillSignedIn(thisTab);
	});
});

describe('a session that ends with no other tab signing out', () => {
	it('still toasts a refusal central manager gives this tab while it is signed in', async () => {
		const { queryClient } = await openClusterPage();

		session = 'cluster-forbidden';
		await nextPoll(queryClient);

		expect(toast.error).toHaveBeenCalledWith('ClientError', expect.objectContaining({ description: 'Not allowed' }));
		expect(screen.getByText('cluster Prod')).toBeTruthy();
	});

	it('signs this tab out without a toast when central manager answers its poll 401', async () => {
		const { queryClient } = await openClusterPage();

		session = 'ended-with-401';
		await nextPoll(queryClient);

		await screen.findByText('sign-in page');
		expect(toast.error).not.toHaveBeenCalled();
	});
});
