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
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

const DEPLOYMENT_ID = '4ac92da3-d8a0-423e-b145-5df107957dd4';

// A real router, so the crumbs come from the match the page is actually on.
function renderAt(path: string, url: string, queryClient = new QueryClient()) {
	const rootRoute = createRootRoute();
	const page = createRoute({ getParentRoute: () => rootRoute, path, component: () => <Breadcrumbs /> });
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
