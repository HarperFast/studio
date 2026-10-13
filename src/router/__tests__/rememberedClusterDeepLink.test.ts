// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Transformed here, while the file is collected, which has no timeout, rather than inside the first test's 5s.
// Each test still evaluates a fresh copy.
import '@/router/rootRouteTree';

const { get, getInstanceUserInfo, registrationInfo } = vi.hoisted(() => ({
	get: vi.fn(),
	getInstanceUserInfo: vi.fn(),
	registrationInfo: vi.fn(),
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
const DEEP_LINK = `/${ORGANIZATION_ID}/${CLUSTER_ID}/logs`;
// A member of the organization without cluster update rights, so an ended session is sent to sign in
// rather than reconnected through Fabric Connect.
const cloudUser = { id: 'usr_a', email: 'a@example.com', roles: {} };

/**
 * A page load on a deep link into a cluster the browser signed into earlier, with what `AppRouted`
 * does on every store update — the store reads its markers at construction, so the modules are fresh.
 */
async function openDeepLink() {
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
		history: createMemoryHistory({ initialEntries: [DEEP_LINK] }),
		context: { queryClient, authentication: { [OverallAppSignIn]: { isLoading: false, user: cloudUser as never } } },
	});
	authStore.listenToAllEntities(() => void router.invalidate());
	void router.load();
	return { authStore, router };
}

beforeEach(() => {
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
			return { data: { id: CLUSTER_ID, organizationId: ORGANIZATION_ID, name: 'prod', status: 'RUNNING' } };
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
