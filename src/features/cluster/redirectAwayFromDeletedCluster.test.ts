// @vitest-environment jsdom
import { authStore } from '@/features/auth/store/authStore';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { LocalUser } from '@/integrations/api/api.patch';
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, isRedirect } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectAwayFromDeletedCluster } from './redirectAwayFromDeletedCluster';

const OVERVIEW = '/org-1/clu-1';
const TERMINATED_AT = '2026-10-12T00:00:00.000Z';

type BeforeLoad = (opts: unknown) => unknown;

// The cluster layout's beforeLoad, then every route's below it down to the leaf, as a bookmark load runs them.
async function landingFor(path: string, cluster: { status: string; terminatedAt?: string }) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(getClusterInfoQueryOptions('clu-1').queryKey, {
		id: 'clu-1',
		name: 'prod-east',
		organizationId: 'org-1',
		...cluster,
	});
	const router = createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		context: { queryClient, authentication: {} },
	});
	const matches = router.matchRoutes(router.state.location);
	const below = matches.slice(matches.findIndex((match) => match.routeId === clusterLayoutRoute.id) + 1);
	const routesById = router.routesById as Record<string, { options: { beforeLoad?: unknown } }>;
	const load = {
		params: matches.at(-1)!.params,
		location: { search: {} },
		abortController: new AbortController(),
		preload: false,
	};
	let context = {
		queryClient,
		authentication: {},
		...await (clusterLayoutRoute.options.beforeLoad as BeforeLoad)({ ...load, context: { queryClient } }) as object,
	};
	try {
		for (const match of below) {
			const beforeLoad = routesById[match.routeId].options.beforeLoad as BeforeLoad | undefined;
			context = { ...context, ...await beforeLoad?.({ ...load, context }) as object };
		}
		return undefined;
	} catch (thrown) {
		if (isRedirect(thrown)) {
			return thrown.options.to;
		}
		throw thrown;
	}
}

const operatesOnLiveCluster = ['instances', 'scaling', 'domains', 'edit', 'edit/version'];
const gone = [
	{ status: 'TERMINATED' },
	{ status: 'TERMINATING' },
	{ status: 'REMOVED' },
	{ status: 'FAILED', terminatedAt: TERMINATED_AT },
];
const live = [{ status: 'RUNNING' }, { status: 'FAILED' }];

describe('a bookmark into a terminated cluster', () => {
	describe.each(gone)('$status cluster (terminatedAt: $terminatedAt)', (cluster) => {
		it.each(operatesOnLiveCluster)('sends /%s to the overview, which says the cluster is gone', async (page) => {
			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBe(OVERVIEW);
		});

		it.each(['', 'usage', 'sign-in'])('lets /%s render', async (page) => {
			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBeUndefined();
		});
	});

	describe.each(live)('$status cluster', (cluster) => {
		it.each(operatesOnLiveCluster)('lets /%s render', async (page) => {
			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBeUndefined();
		});
	});
});

const KEY = 'https://prod-east.example.com:9925/';
const inClusterPages = [
	...['apps', 'databases', 'apis', 'operations', 'status', 'logs', 'config'].map((page) => ({ page, entity: 'clu-1' })),
	...['', 'databases', 'apis', 'operations', 'status', 'logs', 'config'].map((page) => ({
		page: `instance/ins-1/${page}`,
		entity: 'ins-1',
	})),
];

describe('an in-cluster bookmark with a sign-in remembered from before the cluster was terminated', () => {
	afterEach(() => {
		authStore.signOutLocally('clu-1');
		authStore.signOutLocally('ins-1');
		localStorage.clear();
		vi.restoreAllMocks();
	});

	describe.each(gone)('$status cluster (terminatedAt: $terminatedAt)', (cluster) => {
		it.each(inClusterPages)('sends /$page to the overview without checking the sign-in', async ({ page, entity }) => {
			authStore.setUserForIdAndKey(entity, KEY, { username: 'admin' } as LocalUser);
			const check = vi.spyOn(authStore, 'startSignInCheck');

			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBe(OVERVIEW);
			expect(check).not.toHaveBeenCalled();
		});

		it.each(inClusterPages)('sends /$page to the overview without reconnecting a remembered Fabric Connect', async ({
			page,
			entity,
		}) => {
			authStore.flagForFabricConnect(entity, true);
			const establish = vi.spyOn(authStore, 'establishFabricConnectAuth').mockResolvedValue({} as LocalUser);

			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBe(OVERVIEW);
			expect(establish).not.toHaveBeenCalled();
		});
	});

	describe.each(live)('$status cluster', (cluster) => {
		it.each(inClusterPages)('lets /$page render on the remembered sign-in', async ({ page, entity }) => {
			authStore.setUserForIdAndKey(entity, KEY, { username: 'admin' } as LocalUser);

			expect(await landingFor(`${OVERVIEW}/${page}`, cluster)).toBeUndefined();
		});
	});
});

describe(redirectAwayFromDeletedCluster, () => {
	it('lets the page render when the cluster is not in context', () => {
		expect(() => redirectAwayFromDeletedCluster({ params: { organizationId: 'org-1', clusterId: 'clu-1' } }))
			.not.toThrow();
	});
});
