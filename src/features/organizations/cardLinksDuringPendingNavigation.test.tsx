/** @vitest-environment jsdom */
import { describeCluster } from '@/features/clusters/lib/clusterListModel';
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	type AnyRoute,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationPermissions: () => ({ remove: true, update: true }),
	useOrganizationRolePermissions: () => ({ view: true }),
	useOrganizationClusterPermissions: () => ({ view: true, create: true, update: true, remove: true }),
	useContainerOpsPermission: () => false,
}));
vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: () => false,
	useInstanceAuth: () => ({ user: null, isLoading: false }),
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClient: () => ({}) }));
vi.mock('@/features/auth/store/authStore', () => ({ authStore: { checkForFabricConnect: () => false } }));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [null, vi.fn()] }));
vi.mock(
	'@/hooks/useClusterContainerOps',
	() => ({ useClusterContainerOps: () => ({ run: vi.fn(), isPending: false }) }),
);
vi.mock(
	'@/features/clusters/mutations/terminateCluster',
	() => ({ useTerminateClusterMutation: () => ({ mutate: vi.fn(), isPending: false }) }),
);
vi.mock('@/features/clusters/components/ClusterProgress', () => ({ ClusterProgress: () => null }));

import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { OrgCard } from './components/OrgCard';

const cluster: Cluster = {
	id: 'clu-b',
	name: 'Production',
	organizationId: 'org-a',
	status: 'RUNNING',
	fqdn: 'api.example.test',
	plans: [{ planId: 'shared', region: 'US East' }],
};

function Organizations() {
	return (
		<OrgCard
			organizationRole={{ organizationId: 'org-a', organizationName: 'Acme', roleName: 'Admin' }}
			onDeleteOrgModal={() => undefined}
		/>
	);
}

function Clusters() {
	return <ClusterCard item={describeCluster(cluster)} />;
}

/** Every page past the one on screen waits on a request that has not answered: the slow network in #1301. */
function renderRouter(initialPath: string) {
	const rootRoute = createRootRoute({ component: Outlet });
	const waitForever = () => new Promise<void>(() => undefined);
	const organizationRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '$organizationId',
		component: Outlet,
	});
	const clusterRoute = createRoute({
		getParentRoute: () => organizationRoute,
		path: '$clusterId',
		beforeLoad: waitForever,
		component: Outlet,
	});
	const leaf = (parent: AnyRoute, path: string) =>
		createRoute({ getParentRoute: () => parent, path, component: Outlet });
	const routeTree = rootRoute.addChildren([
		createRoute({ getParentRoute: () => rootRoute, path: '/', component: Organizations }),
		organizationRoute.addChildren([
			createRoute({
				getParentRoute: () => organizationRoute,
				path: '/',
				beforeLoad: initialPath === '/' ? waitForever : undefined,
				component: Clusters,
			}),
			leaf(organizationRoute, 'roles'),
			clusterRoute.addChildren([leaf(clusterRoute, 'sign-in')]),
		]),
	]);
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }) });
	render(
		<QueryClientProvider client={new QueryClient()}>
			<RouterProvider router={router as never} />
		</QueryClientProvider>,
	);
	return router;
}

async function openOptions(name: string) {
	const trigger = await screen.findByRole('button', { name });
	await act(async () => {
		fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
	});
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
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

describe('a card clicked again while its first navigation is still loading (#1301)', () => {
	it('opens the same organization, not the organization nested under itself', async () => {
		const router = renderRouter('/');
		const card = await screen.findByRole('link', { name: 'Open Acme' });

		await click(card);
		await waitFor(() => expect(router.latestLocation.pathname).toBe('/org-a'));
		// Still the organizations page: the organization has not finished loading.
		await click(screen.getByRole('link', { name: 'Open Acme' }));

		expect(router.latestLocation.pathname).toBe('/org-a');
	});

	it('links every organization menu item to that organization, from the pending location', async () => {
		const router = renderRouter('/');
		await click(await screen.findByRole('link', { name: 'Open Acme' }));
		await waitFor(() => expect(router.latestLocation.pathname).toBe('/org-a'));

		await openOptions('Options');

		const hrefs = screen.getAllByRole('menuitem').map(item => item.closest('a')?.getAttribute('href')).filter(Boolean);
		expect(hrefs).toEqual(['/org-a', '/org-a/roles', '/org-a/users', '/org-a/billing', '/org-a/settings']);
	});

	it('signs in to the same cluster, not a sign-in page nested under the first', async () => {
		const router = renderRouter('/org-a');
		await openOptions('Cluster options');
		await click(await screen.findByRole('menuitem', { name: 'Direct Sign In' }));
		await waitFor(() => expect(router.latestLocation.pathname).toBe('/org-a/clu-b/sign-in'));

		// Still the cluster list: the cluster has not finished loading.
		await openOptions('Cluster options');
		await click(await screen.findByRole('menuitem', { name: 'Direct Sign In' }));

		expect(router.latestLocation.pathname).toBe('/org-a/clu-b/sign-in');
	});
});
