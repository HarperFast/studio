// @vitest-environment jsdom
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

function matchDeepLink(path: string) {
	const router = createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		context: { queryClient: new QueryClient(), authentication: {} },
	});
	// matchRoutes parses the path against the route tree (params, matched ids)
	// without running beforeLoad/loaders — exactly the layer the regression broke.
	const matches = router.matchRoutes(router.state.location);
	return matches;
}

// Regression: the cluster-mode instance layout was wired in under the wrong
// parent (clustersLayoutRoute) while declaring `getParentRoute: clusterLayoutRoute`.
// TanStack Router 1.170 resolved that mismatch into a corrupted route tree —
// static segments (`config`, `ssh-keys`) were parsed as params and the real
// `organizationId`/`clusterId` were dropped, so the org prefetch in
// orgLayoutRoute.beforeLoad fetched /Organization/undefined.
describe('deep-link route matching for cluster instance pages', () => {
	it('parses organizationId/clusterId and matches the logs route', () => {
		const matches = matchDeepLink('/org-qpz5akmyrp1d0opj/clu-tc9pqw20vrks2zik/logs');
		const leaf = matches.at(-1)!;

		expect(leaf.params).toMatchObject({
			organizationId: 'org-qpz5akmyrp1d0opj',
			clusterId: 'clu-tc9pqw20vrks2zik',
		});
		// The real organizationId must be present so the org prefetch never hits
		// /Organization/undefined.
		expect(leaf.params).not.toHaveProperty('organizationId', undefined);
		expect(leaf.routeId).toContain('/logs');
	});

	it('matches the cluster edit route (same misplacement class as the org bug)', () => {
		const matches = matchDeepLink('/org-qpz5akmyrp1d0opj/clu-tc9pqw20vrks2zik/edit');
		const leaf = matches.at(-1)!;

		expect(leaf.routeId).toContain('/edit');
		expect(leaf.params).toMatchObject({
			organizationId: 'org-qpz5akmyrp1d0opj',
			clusterId: 'clu-tc9pqw20vrks2zik',
		});
	});

	it('still matches explicit instance routes', () => {
		const matches = matchDeepLink(
			'/org-qpz5akmyrp1d0opj/clu-tc9pqw20vrks2zik/instance/ins-abc123/logs',
		);
		const leaf = matches.at(-1)!;

		expect(leaf.params).toMatchObject({
			organizationId: 'org-qpz5akmyrp1d0opj',
			clusterId: 'clu-tc9pqw20vrks2zik',
			instanceId: 'ins-abc123',
		});
	});
});
