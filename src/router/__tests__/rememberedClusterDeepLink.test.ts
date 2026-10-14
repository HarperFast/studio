// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Transformed here, while the file is collected, which has no timeout, rather than inside the first test's 5s.
// Each test still evaluates a fresh copy.
import '@/router/rootRouteTree';

const { get, getInstanceUserInfo, registrationInfo, createInstanceAuthenticationTokens } = vi.hoisted(() => ({
	get: vi.fn(),
	getInstanceUserInfo: vi.fn(),
	registrationInfo: vi.fn(),
	createInstanceAuthenticationTokens: vi.fn(),
}));
vi.mock('@/config/apiClient', () => ({
	apiClient: {
		get,
		post: vi.fn(),
		defaults: { baseURL: 'https://cm.example.com' },
		interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
	},
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', async (importOriginal) => ({
	...await importOriginal<object>(),
	createInstanceAuthenticationTokens,
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: ({ entityId }: { entityId: string }) => ({
		queryKey: ['registration_info', entityId],
		queryFn: registrationInfo,
		retry: false,
	}),
}));

const ORGANIZATION_ID = 'org-qmvwv3tdm45a9d4a';
const CLUSTER_ID = 'clu-xymqtds2k905g4v7';
const CLUSTER_URL = 'https://cluster.example.com:9925/';
const INSTANCE_ID = 'ins-xymqtds2k905g4v7-1';
const INSTANCE_URL = 'https://ins-1.cluster.example.com:9925/';
const OVERVIEW = `/${ORGANIZATION_ID}/${CLUSTER_ID}`;
const DEEP_LINK = `${OVERVIEW}/logs`;
// A member of the organization without cluster update rights, so an ended session is sent to sign in
// rather than reconnected through Fabric Connect.
const cloudUser = { id: 'usr_a', email: 'a@example.com', roles: {} };

/**
 * A page load on a deep link into a cluster the browser signed into earlier, with what `AppRouted`
 * does on every store update — the store reads its markers at construction, so the modules are fresh.
 */
async function openDeepLink(path = DEEP_LINK) {
	vi.resetModules();
	const [{ authStore, OverallAppSignIn }, { queryClient }, { rootRouteTree }, { createMemoryHistory, createRouter }] =
		await Promise.all([
			import('@/features/auth/store/authStore'),
			import('@/react-query/queryClient'),
			import('@/router/rootRouteTree'),
			import('@tanstack/react-router'),
		]);
	const router = createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		context: { queryClient, authentication: { [OverallAppSignIn]: { isLoading: false, user: cloudUser as never } } },
	});
	authStore.listenToAllEntities(() => void router.invalidate());
	void router.load();
	return { authStore, router };
}

let cluster: { status: string; terminatedAt?: string };

beforeEach(() => {
	cluster = { status: 'RUNNING' };
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem(
		'Studio:PotentiallyAuthenticated',
		JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn', [CLUSTER_ID]: CLUSTER_URL }),
	);
	get.mockImplementation(async (url: string) => {
		if (url === '/User/current') {
			return { data: cloudUser };
		}
		if (url === `/Organization/${ORGANIZATION_ID}`) {
			return { data: { id: ORGANIZATION_ID, name: 'Acme' } };
		}
		if (url === `/Cluster/${CLUSTER_ID}`) {
			return { data: { id: CLUSTER_ID, organizationId: ORGANIZATION_ID, name: 'prod', ...cluster } };
		}
		throw new Error(`unexpected GET ${url}`);
	});
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('a deep link into a remembered cluster, now that no page-load sweep checks it first', () => {
	it('sends an ended session to sign in, even when the route data failed on it first', async () => {
		getInstanceUserInfo.mockRejectedValue(new Error('Request failed with status code 401'));
		registrationInfo.mockRejectedValue(new Error('Request failed with status code 401'));

		const { router } = await openDeepLink();

		await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/${ORGANIZATION_ID}/${CLUSTER_ID}/sign-in`));
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
	});

	it('stays on the page, and checks the cluster once, when the session is still live', async () => {
		getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
		registrationInfo.mockResolvedValue({ version: '5.2.0' });

		const { authStore, router } = await openDeepLink();

		await vi.waitFor(() => expect(authStore.getConnectionById(CLUSTER_ID).user).toEqual({ username: 'admin' }));
		await vi.waitFor(() => expect(router.state.status).toBe('idle'));
		expect(router.state.location.pathname).toBe(DEEP_LINK);
		expect(router.state.matches.filter((match) => match.status === 'error')).toEqual([]);
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
	});
});

describe('a deep link into a remembered cluster that has been terminated since', () => {
	const remembered = [
		{ page: 'logs', entity: CLUSTER_ID, url: CLUSTER_URL },
		{ page: `instance/${INSTANCE_ID}/logs`, entity: INSTANCE_ID, url: INSTANCE_URL },
	];

	beforeEach(() => {
		cluster = { status: 'TERMINATED', terminatedAt: '2026-10-12T00:00:00.000Z' };
		// A host that still answers: a removed self-hosted cluster's own server.
		getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
		registrationInfo.mockResolvedValue({ version: '5.2.0' });
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'token' });
	});

	function remember(entity: string, url: string) {
		localStorage.setItem(
			'Studio:PotentiallyAuthenticated',
			JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn', [CLUSTER_ID]: CLUSTER_URL, [entity]: url }),
		);
	}

	it.each(remembered)('sends /$page to the overview before checking the sign-in or loading the page', async ({
		page,
		entity,
		url,
	}) => {
		remember(entity, url);

		const { router } = await openDeepLink(`${OVERVIEW}/${page}`);

		await vi.waitFor(() => expect(router.state.location.pathname).toBe(OVERVIEW));
		await vi.waitFor(() => expect(router.state.status).toBe('idle'));
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
		expect(registrationInfo).not.toHaveBeenCalled();
	});

	it.each(remembered)('sends /$page to the overview without minting a Fabric Connect token', async ({
		page,
		entity,
		url,
	}) => {
		remember(entity, url);
		localStorage.setItem(`Studio:FabricConnect:${entity}`, 'true');

		const { router } = await openDeepLink(`${OVERVIEW}/${page}`);

		await vi.waitFor(() => expect(router.state.location.pathname).toBe(OVERVIEW));
		await vi.waitFor(() => expect(router.state.status).toBe('idle'));
		expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
		expect(registrationInfo).not.toHaveBeenCalled();
	});

	it.each(remembered)('keeps the sign-in through route loads and preloads, which render nothing (/$page)', async ({
		page,
		entity,
		url,
	}) => {
		remember(entity, url);

		const { authStore, router } = await openDeepLink(OVERVIEW);
		await vi.waitFor(() => expect(router.state.status).toBe('idle'));
		await router.preloadRoute({ to: `${OVERVIEW}/${page}` });

		expect(authStore.getOperationsUrl(entity)).toBe(url);
		expect(authStore.getOperationsUrl(CLUSTER_ID)).toBe(CLUSTER_URL);
	});
});
