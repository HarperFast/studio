// @vitest-environment jsdom
import { rootRouteTree } from '@/router/rootRouteTree';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

function routerAt(path: string) {
	return createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		// An empty `authentication` leaves dashboardLayout's guard inert, so these tests exercise the
		// admin routes rather than the sign-in redirect.
		context: { queryClient: new QueryClient(), authentication: {} },
	});
}

function matchLeaf(path: string) {
	const router = routerAt(path);
	return router.matchRoutes(router.state.location).at(-1)!;
}

// Regression: adding Regions moved Notifications onto the section index (`path: '/'`), which took
// /admin/notifications — a URL that had already shipped — out of the tree entirely. Every admin
// section needs its own addressable path; /admin is a redirect to the first one.
describe('admin section routes', () => {
	it.each([
		['/admin/notifications', '/notifications'],
		['/admin/regions', '/regions'],
		['/admin/api-token', '/api-token'],
	])('%s resolves to its own route', (path, expectedId) => {
		expect(matchLeaf(path).routeId).toContain(expectedId);
	});

	it('/admin no longer claims a section route', () => {
		expect(matchLeaf('/admin').routeId).not.toContain('/notifications');
	});

	it('/admin redirects to the first section', async () => {
		const router = routerAt('/admin');
		await router.load();
		expect(router.state.location.pathname).toBe('/admin/notifications');
	});
});
