/** @vitest-environment jsdom */
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

afterEach(cleanup);

const DEPLOYMENT_ID = '4ac92da3-d8a0-423e-b145-5df107957dd4';

// A real router, so the crumbs come from the match the page is actually on.
function renderAt(
	path: string,
	url: string,
	queryClient = new QueryClient(),
	props?: Parameters<typeof Breadcrumbs>[0],
) {
	const rootRoute = createRootRoute();
	const page = createRoute({
		getParentRoute: () => rootRoute,
		path,
		component: () => <Breadcrumbs {...props} />,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([page]),
		history: createMemoryHistory({ initialEntries: [url] }),
	});
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

describe('Breadcrumbs', () => {
	it('shows a deployment id as an id, not Title Cased', async () => {
		renderAt(
			'$organizationId/$clusterId/config/deployments/$deploymentId',
			`/org-a/clu-a/config/deployments/${DEPLOYMENT_ID}`,
		);
		const crumb = await screen.findByRole('link', { name: '4ac92da3' });
		expect(crumb.getAttribute('title')).toBe(DEPLOYMENT_ID);
		expect(crumb.getAttribute('href')).toBe(`/org-a/clu-a/config/deployments/${DEPLOYMENT_ID}`);
		expect(screen.getByRole('link', { name: 'Deployments' })).toBeTruthy();
		expect(screen.queryByText(/4 Ac 92/)).toBeNull();
	});

	it('shows a name as it was written', async () => {
		renderAt('$organizationId/$clusterId/config/users/$username', '/org-a/clu-a/config/users/hdb_admin');
		expect(await screen.findByRole('link', { name: 'hdb_admin' })).toBeTruthy();
		expect(screen.queryByText('Hdb Admin')).toBeNull();
	});
});

describe('Breadcrumbs short of room', () => {
	beforeAll(() => {
		// Radix menus need these in jsdom (see AGENTS.md, "Testing Radix menus in jsdom").
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
		Element.prototype.scrollIntoView = () => {};
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	});

	const USERS_PAGE = [
		'$organizationId/$clusterId/config/users/$username',
		'/org-a/clu-a/config/users/hdb_admin',
	] as const;

	it('folds the leading crumbs behind a menu that still links to each of them', async () => {
		renderAt(...USERS_PAGE, new QueryClient(), { collapse: 2 });
		expect(await screen.findByRole('link', { name: 'hdb_admin' })).toBeTruthy();
		expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
			'Home',
			'Config',
			'Users',
			'hdb_admin',
		]);

		fireEvent.pointerDown(screen.getByRole('button', { name: 'Show the rest of the path' }), {
			button: 0,
			ctrlKey: false,
		});
		const folded = screen.getAllByRole('menuitem');
		expect(folded.map((item) => item.textContent)).toEqual(['Org', 'Cluster']);
		expect(folded.map((item) => item.getAttribute('href'))).toEqual(['/org-a', '/org-a/clu-a']);
	});

	it('always shows the last crumb, however many it is asked to fold', async () => {
		renderAt(...USERS_PAGE, new QueryClient(), { collapse: 99 });
		expect(await screen.findByRole('link', { name: 'hdb_admin' })).toBeTruthy();
		expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Home', 'hdb_admin']);
	});

	it('keeps the entity link and preserves the rest of the trail in a separate menu', async () => {
		renderAt(...USERS_PAGE, new QueryClient(), { keepPath: '/org-a/clu-a' });
		const cluster = await screen.findByRole('link', { name: 'Cluster' });
		expect(cluster.getAttribute('href')).toBe('/org-a/clu-a');
		expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Cluster']);
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Show other breadcrumbs' }), {
			button: 0,
			ctrlKey: false,
		});
		expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
			'Org',
			'Config',
			'Users',
			'hdb_admin',
		]);
	});

	it('has no menu while nothing is folded', async () => {
		renderAt(...USERS_PAGE);
		expect(await screen.findByRole('link', { name: 'Org' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Show the rest of the path' })).toBeNull();
	});
});

describe('Breadcrumbs for a component page', () => {
	it("names the page from the cluster's configuration, as one crumb for ext/<key>", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(['clu-1', 'get_studio_configuration'], {
			navigation: {},
			pages: [{ key: 'harper-redirects.redirects', name: 'Redirects' }],
		});
		renderAt(
			'/$organizationId/$clusterId/ext/$extensionKey',
			'/org-1/clu-1/ext/harper-redirects.redirects',
			queryClient,
		);

		const crumb = await screen.findByRole('link', { name: 'Redirects' });
		expect(crumb.getAttribute('href')).toBe('/org-1/clu-1/ext/harper-redirects.redirects');
		expect(screen.queryByRole('link', { name: 'Ext' })).toBeNull();
	});

	it('falls back to the key before the configuration has loaded', async () => {
		renderAt('/$organizationId/$clusterId/ext/$extensionKey', '/org-1/clu-1/ext/harper-redirects.redirects');

		expect(await screen.findByRole('link', { name: 'harper-redirects.redirects' })).toBeTruthy();
	});
});
