// @vitest-environment jsdom
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { redirectAwayFromDeletedCluster } from './redirectAwayFromDeletedCluster';

const OVERVIEW = '/org-1/clu-1';
const TERMINATED_AT = '2026-10-12T00:00:00.000Z';

type BeforeLoad = (opts: unknown) => unknown;

// The cluster layout's beforeLoad, then the leaf's, as a bookmark load runs them. Returns the redirect target.
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
	const leaf = router.matchRoutes(router.state.location).at(-1)!;
	const routesById = router.routesById as Record<string, { options: { beforeLoad?: unknown } }>;
	const load = {
		params: leaf.params,
		location: { search: {} },
		abortController: new AbortController(),
		preload: false,
	};
	const layoutContext = await (clusterLayoutRoute.options.beforeLoad as BeforeLoad)({
		...load,
		context: { queryClient },
	});
	try {
		(routesById[leaf.routeId].options.beforeLoad as BeforeLoad | undefined)?.({
			...load,
			context: { queryClient, ...(layoutContext as object) },
		});
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

describe(redirectAwayFromDeletedCluster, () => {
	it('lets the page render when the cluster is not in context', () => {
		expect(() => redirectAwayFromDeletedCluster({ params: { organizationId: 'org-1', clusterId: 'clu-1' } }))
			.not.toThrow();
	});
});
