// @vitest-environment jsdom
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

// Regression coverage for #1440: the status tab/range/refresh search params
// used to be validated by hand inside StatusTabs and cleaned up with a
// navigate-on-unmount effect that could clobber the destination route's own
// search params. They are now declared on the status route (validateSearch +
// stripSearchParams), so the router scopes and normalizes them declaratively.
// Like orgUndefinedRepro.test.ts, these tests use matchRoutes/buildLocation —
// no loaders, no network.

const INSTANCE_BASE = '/org-qpz5akmyrp1d0opj/clu-tc9pqw20vrks2zik/instance/ins-abc123';
const STATUS_PATH = `${INSTANCE_BASE}/status`;

function makeRouter(initialEntry: string) {
	return createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [initialEntry] }),
		context: { queryClient: new QueryClient(), authentication: {} },
	});
}

describe('status route search-param scoping', () => {
	it('validates deep-linked search params on the status route', () => {
		const router = makeRouter(`${STATUS_PATH}?tab=traffic&range=6h`);
		const leaf = router.matchRoutes(router.state.location).at(-1)!;
		expect(leaf.routeId).toContain('/status');
		expect(leaf.search).toEqual({ tab: 'traffic', range: '6h', refresh: 60_000 });
	});

	it('normalizes invalid deep-link values to defaults instead of erroring', () => {
		const router = makeRouter(`${STATUS_PATH}?tab=garbage&range=999y&refresh=17`);
		const leaf = router.matchRoutes(router.state.location).at(-1)!;
		expect(leaf.search).toEqual({ tab: 'health', range: '1h', refresh: 60_000 });
	});

	it('strips default values from status URLs', () => {
		const router = makeRouter(STATUS_PATH);
		const loc = router.buildLocation({
			to: STATUS_PATH,
			search: { tab: 'health', range: '1h', refresh: 60_000 },
		});
		expect(loc.searchStr).toBe('');
	});

	it('keeps only non-default values in status URLs', () => {
		const router = makeRouter(STATUS_PATH);
		const loc = router.buildLocation({
			to: STATUS_PATH,
			search: { tab: 'traffic', range: '1h', refresh: 60_000 },
		});
		expect(loc.searchStr).toBe('?tab=traffic');
	});

	it('does not carry status params onto sibling routes', () => {
		// From a status location with non-default params, a plain nav-bar-style
		// navigation (no `search`) must land on a clean sibling URL.
		const router = makeRouter(`${STATUS_PATH}?tab=traffic&range=6h`);
		const loc = router.buildLocation({ to: `${INSTANCE_BASE}/logs` });
		expect(loc.searchStr).toBe('');
		expect(loc.search).toEqual({});
	});
});
