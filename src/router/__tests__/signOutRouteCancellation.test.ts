// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({
	apiClient: {
		get,
		post: vi.fn(),
		defaults: { baseURL: 'https://cm.example.com' },
		interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
	},
}));

import { clearAuthStateLocally } from '@/features/auth/handlers/clearAuthStateLocally';
import { AuthenticatedConnection, authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { queryClient } from '@/react-query/queryClient';
import { rootRouteTree } from '@/router/rootRouteTree';
import { isCancelledError } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';

const ORGANIZATION_ID = 'org-qmvwv3tdm45a9d4a';
const CLUSTER_ID = 'clu-xymqtds2k905g4v7';
const DEEP_LINK = `/${ORGANIZATION_ID}/${CLUSTER_ID}/apps`;
const user = { id: 'usr_a', email: 'a@example.com', roles: [] } as unknown as NonNullable<
	AuthenticatedConnection['user']
>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function authentication(signedInUser: AuthenticatedConnection['user']) {
	return { [OverallAppSignIn]: { isLoading: false, user: signedInUser } };
}

function routerAtDeepLink() {
	return createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [DEEP_LINK] }),
		context: { queryClient, authentication: authentication(user) },
	});
}

function erroredMatches(router: ReturnType<typeof routerAtDeepLink>) {
	return router.state.matches.filter((match) => match.status === 'error').map((match) => match.error);
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	queryClient.clear();
	authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user);
	// Keeps the deep link's route data in flight when the teardown runs.
	get.mockReset().mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a sign-out that clears the query cache under a loading route', () => {
	it.each([
		['the organization route', `/Organization/${ORGANIZATION_ID}`, () => undefined],
		[
			'the cluster route',
			`/Cluster/${CLUSTER_ID}`,
			() => queryClient.setQueryData([ORGANIZATION_ID], { id: ORGANIZATION_ID }),
		],
	])(
		'never surfaces %s data it cancelled as a route error, and still lands on sign-in',
		async (_route, requested, seed) => {
			seed();
			const router = routerAtDeepLink();
			void router.load();
			await flush();
			expect(get.mock.calls.map(([url]) => url)).toEqual([requested]);

			// What the CM 401 interceptor runs, before the store's listeners reach AppRouted.
			clearAuthStateLocally();
			await flush();

			expect(erroredMatches(router)).toEqual([]);

			// What AppRouted does once the store's listeners deliver the signed-out state.
			router.update({ ...router.options, context: { queryClient, authentication: authentication(null) } });
			await router.invalidate();

			expect(router.state.location.pathname).toBe('/sign-in');
			expect(erroredMatches(router)).toEqual([]);
		},
	);

	it('still reports a cancellation no sign-out caused', async () => {
		const router = routerAtDeepLink();
		void router.load();
		await flush();

		queryClient.getQueryCache().clear();
		await flush();

		const errors = erroredMatches(router);
		expect(errors).toHaveLength(1);
		expect(isCancelledError(errors[0])).toBe(true);
	});
});
