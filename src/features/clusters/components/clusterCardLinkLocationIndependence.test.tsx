/** @vitest-environment jsdom */
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster } from '@/integrations/api/api.patch';
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, create: true, update: true, remove: true }),
	useContainerOpsPermission: () => false,
}));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: { username: 'admin' }, isLoading: false }) }));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClient: () => ({}) }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { checkForFabricConnect: () => true } }));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [null, () => {}] }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [() => {}, () => {}] }));
vi.mock(
	'@/hooks/useClusterContainerOps',
	() => ({ useClusterContainerOps: () => ({ run: () => {}, isPending: false }) }),
);
vi.mock(
	'@/features/clusters/mutations/terminateCluster',
	() => ({ useTerminateClusterMutation: () => ({ mutate: () => {}, isPending: false }) }),
);
vi.mock('@/features/clusters/components/ClusterProgress', () => ({ ClusterProgress: () => null }));

import { ClusterCard } from './ClusterCard';

const CLUSTER_ROUTE = '/_dashboardLayout/_orgsLayout/$organizationId/_clusterLayout/$clusterId';
const MENU_TARGETS = {
	'Direct Sign In': ['/org-a/clu-c/sign-in', `${CLUSTER_ROUTE}/sign-in`, {}],
	'Edit Scaling': ['/org-a/clu-c/edit', `${CLUSTER_ROUTE}/edit`, {}],
	'Edit Version': ['/org-a/clu-c/edit/version', `${CLUSTER_ROUTE}/edit/$mode`, { mode: 'version' }],
	'Domains': ['/org-a/clu-c/domains', `${CLUSTER_ROUTE}/domains`, {}],
	'Instances': ['/org-a/clu-c/instances', `${CLUSTER_ROUTE}/instances`, {}],
	'Deployments': ['/org-a/clu-c/config/deployments', `${CLUSTER_ROUTE}/_instanceLayout/config/deployments`, {}],
} as const;
const MENU_HREFS = Object.fromEntries(Object.entries(MENU_TARGETS).map(([label, [href]]) => [label, href]));

const cluster: Cluster = {
	id: 'clu-c',
	name: 'Production',
	organizationId: 'org-a',
	status: 'RUNNING',
	fqdn: 'api.example.test',
	plans: [{ planId: 'shared', region: 'US East' }],
};

function Card() {
	return <ClusterCard item={describeCluster(cluster, undefined, undefined)} />;
}

function renderCardAt(path: string) {
	const rootRoute = createRootRoute({ component: Outlet });
	const routeTree = rootRoute.addChildren(
		[
			'$organizationId',
			'$organizationId/$clusterId',
			'$organizationId/$clusterId/instances',
			'$organizationId/$clusterId/edit',
		].map(routePath => createRoute({ getParentRoute: () => rootRoute, path: routePath, component: Card })),
	);
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		trailingSlash: 'never',
	});
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router as never} />
		</QueryClientProvider>,
	);
	return router;
}

async function openMenu() {
	fireEvent.pointerDown(await screen.findByRole('button', { name: 'Cluster options' }), { button: 0, ctrlKey: false });
	await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
}

function menuHrefs() {
	return Object.fromEntries(
		screen.getAllByRole('menuitem')
			.map(item => [item.textContent, item.closest('a')?.getAttribute('href')] as const)
			.filter(([, href]) => href !== undefined),
	);
}

beforeAll(() => {
	Object.assign(Element.prototype, {
		hasPointerCapture: () => false,
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		scrollIntoView: () => {},
	});
	window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
});
afterEach(cleanup);

describe('cluster card menu links', () => {
	it.each([
		['its own cluster list', '/org-a'],
		['a sibling cluster the router is moving into', '/org-a/clu-b'],
		['a page of an unrelated org and cluster', '/org-z/clu-z/instances'],
	])("resolve from the card's cluster alone while the router is at %s", async (_where, path) => {
		renderCardAt(path);
		await openMenu();

		expect(menuHrefs()).toEqual(MENU_HREFS);
	});

	it('navigate to the target when a menu item is clicked', async () => {
		const router = renderCardAt('/org-a/clu-b');
		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Scaling' }));

		await waitFor(() => expect(router.state.location.pathname).toBe('/org-a/clu-c/edit'));
	});
});

describe('the asserted cluster card hrefs against the production route tree', () => {
	it.each(Object.values(MENU_TARGETS))('%s matches %s', (href, routeId, extraParams) => {
		const router = createRouter({
			routeTree: rootRouteTree,
			history: createMemoryHistory({ initialEntries: [href] }),
			trailingSlash: 'never',
			context: { queryClient: new QueryClient(), authentication: {} },
		});
		const leaf = router.matchRoutes(router.state.location).at(-1)!;

		expect(leaf.routeId).toBe(routeId);
		expect(leaf.params).toEqual({ organizationId: 'org-a', clusterId: 'clu-c', ...extraParams });
	});
});
