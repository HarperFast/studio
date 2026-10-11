/** @vitest-environment jsdom */
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

vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => true }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationPermissions: () => ({ update: true, remove: true }),
	useOrganizationRolePermissions: () => ({ view: true }),
}));
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyToClipboard: () => [() => {}] }));
vi.mock('@/features/organization/modals/AddCouponModal', () => ({ AddCouponModal: () => null }));

import { OrgCard } from './OrgCard';

const ORG_ROUTE = '/_dashboardLayout/_orgsLayout/$organizationId';
const CARD_HREF = '/org-a';
const MENU_TARGETS = {
	Clusters: ['/org-a', `${ORG_ROUTE}/_clusterLayout/`],
	Roles: ['/org-a/roles', `${ORG_ROUTE}/roles`],
	Users: ['/org-a/users', `${ORG_ROUTE}/users`],
	Billing: ['/org-a/billing', `${ORG_ROUTE}/billing/`],
	Settings: ['/org-a/settings', `${ORG_ROUTE}/settings`],
} as const;
const MENU_HREFS = Object.fromEntries(Object.entries(MENU_TARGETS).map(([label, [href]]) => [label, href]));

function Card() {
	return (
		<OrgCard
			organizationRole={{ organizationId: 'org-a', organizationName: 'Acme', roleName: 'admin' }}
			onDeleteOrgModal={() => {}}
		/>
	);
}

function renderCardAt(path: string) {
	const rootRoute = createRootRoute({ component: Outlet });
	const routeTree = rootRoute.addChildren(
		['/', '$organizationId', '$organizationId/roles'].map(routePath =>
			createRoute({ getParentRoute: () => rootRoute, path: routePath, component: Card })
		),
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
	fireEvent.pointerDown(await screen.findByRole('button', { name: 'Options' }), { button: 0, ctrlKey: false });
	await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
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

describe.each([
	['its own org list', '/'],
	['a sibling org the router is moving into', '/org-b'],
	['a page of a sibling org', '/org-b/roles'],
])('org card links while the router is at %s', (_where, path) => {
	it("open the card's org from the card itself", async () => {
		renderCardAt(path);

		expect((await screen.findByRole('link', { name: 'Open Acme' })).getAttribute('href')).toBe(CARD_HREF);
	});

	it("resolve every menu target from the card's org alone", async () => {
		renderCardAt(path);
		await openMenu();
		const hrefs = Object.fromEntries(
			screen.getAllByRole('menuitem')
				.map(item => [item.textContent, item.closest('a')?.getAttribute('href')] as const)
				.filter(([, href]) => href !== undefined),
		);

		expect(hrefs).toEqual(MENU_HREFS);
	});
});

describe('org card navigation', () => {
	it("lands on the card's org when the card is clicked", async () => {
		const router = renderCardAt('/org-b');
		fireEvent.click(await screen.findByRole('link', { name: 'Open Acme' }));

		await waitFor(() => expect(router.state.location.pathname).toBe(CARD_HREF));
	});

	it('lands on the target when a menu item is clicked', async () => {
		const router = renderCardAt('/org-b');
		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Roles' }));

		await waitFor(() => expect(router.state.location.pathname).toBe('/org-a/roles'));
	});
});

describe('the asserted org card hrefs against the production route tree', () => {
	it.each(Object.values(MENU_TARGETS))('%s matches %s', (href, routeId) => {
		const router = createRouter({
			routeTree: rootRouteTree,
			history: createMemoryHistory({ initialEntries: [href] }),
			trailingSlash: 'never',
			context: { queryClient: new QueryClient(), authentication: {} },
		});
		const leaf = router.matchRoutes(router.state.location).at(-1)!;

		expect(leaf.routeId).toBe(routeId);
		expect(leaf.params).toEqual({ organizationId: 'org-a' });
	});
});
