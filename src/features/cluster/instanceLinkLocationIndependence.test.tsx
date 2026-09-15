/** @vitest-environment jsdom */
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: undefined, isLoading: false }) }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterInstancePermissions: () => ({ update: true }) }));
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClient: () => ({}),
	useInstanceClientIdParams: () => ({}),
}));
vi.mock('@/integrations/api/instance/status/setStatus', () => ({ useSetStatus: () => ({ mutate: () => {} }) }));
vi.mock('@/hooks/useInstanceContainerOps', () => ({ useInstanceContainerOps: () => ({ run: () => {} }) }));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [() => {}, () => {}] }));

import { InstanceLogInCell } from './InstanceLogInCell';
import { useInstanceMenuItems } from './useInstanceMenuItems';

const INSTANCE_HREF = '/org-a/clu-b/instance/ins-c';
const SIGN_IN_HREF = '/org-a/clu-b/instance/ins-c/sign-in';

const instance = {
	id: 'ins-c',
	name: 'primary',
	status: 'RUNNING',
	instanceFqdn: 'ins-c.example.com',
} as never;

function Cell() {
	return <InstanceLogInCell isSelfManaged={false} instance={instance} />;
}

function Menu() {
	const { items } = useInstanceMenuItems(instance, false, false);
	return (
		<>
			{items.map(item => 'to' in item && item.to ? <Link key={item.key} to={item.to} /> : null)}
		</>
	);
}

function buildRouter(path: string, component: () => React.ReactNode) {
	const rootRoute = createRootRoute({ component: Outlet });
	const clusterRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '$organizationId/$clusterId',
		component: Outlet,
	});
	const routeTree = rootRoute.addChildren([
		clusterRoute.addChildren([
			createRoute({ getParentRoute: () => clusterRoute, path: 'instances', component }),
			createRoute({ getParentRoute: () => clusterRoute, path: 'instance/$instanceId', component }),
			createRoute({ getParentRoute: () => clusterRoute, path: 'instance/$instanceId/config', component }),
		]),
	]);
	return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }), trailingSlash: 'never' });
}

async function renderedHrefs(path: string, component: () => React.ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={buildRouter(path, component) as never} />
		</QueryClientProvider>,
	);
	await waitFor(() => expect(screen.getAllByRole('link').length).toBeGreaterThan(0));
	return screen.getAllByRole('link').map(link => link.getAttribute('href'));
}

afterEach(cleanup);

describe.each([
	['row buttons', Cell],
	['row menu', Menu],
])('instance %s links', (_name, component) => {
	it.each([
		'/org-a/clu-b/instances',
		'/org-a/clu-b/instance/ins-c',
		'/org-a/clu-b/instance/ins-c/config',
	])('resolve the same from %s', async (path) => {
		const hrefs = await renderedHrefs(path, component);

		expect(hrefs).toContain(INSTANCE_HREF);
		expect(hrefs).toContain(SIGN_IN_HREF);
		expect(hrefs.every(href => href?.startsWith('/org-a/clu-b/instance/ins-c'))).toBe(true);
	});
});

describe('the asserted hrefs against the production route tree', () => {
	it.each([
		[INSTANCE_HREF, 'instance/$instanceId'],
		[SIGN_IN_HREF, 'instance/$instanceId/sign-in'],
	])('%s matches %s with the instance id bound', (href, expectedRouteSuffix) => {
		const router = createRouter({
			routeTree: rootRouteTree,
			history: createMemoryHistory({ initialEntries: [href] }),
			trailingSlash: 'never',
			context: { queryClient: new QueryClient(), authentication: {} },
		});
		const leaf = router.matchRoutes(router.state.location).at(-1)!;

		expect(leaf.routeId).toContain(expectedRouteSuffix);
		expect(leaf.params).toMatchObject({ organizationId: 'org-a', clusterId: 'clu-b', instanceId: 'ins-c' });
	});
});
