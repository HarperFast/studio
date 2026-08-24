/**
 * @vitest-environment jsdom
 */
import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { rum } = vi.hoisted(() => ({
	rum: {
		init: vi.fn(),
		startView: vi.fn(),
		onReady: vi.fn((callback: () => void) => callback()),
		setUser: vi.fn(),
		clearUser: vi.fn(),
		addAction: vi.fn(),
	},
}));

vi.mock('@datadog/browser-rum', () => ({ datadogRum: rum }));
vi.mock('@datadog/browser-rum-react', () => ({ reactPlugin: () => ({ name: 'react' }) }));
vi.mock('@/features/notifications/NotificationsSubscriptionManager', () => ({
	NotificationsSubscriptionManager: () => null,
}));
vi.mock('@/components/NotificationBanner', () => ({ NotificationBanner: () => null }));

// Real `rootRoute` and real `dashboardLayout`, stub leaves: mocking either would stop this from
// guarding the one thing it exists for — that the tracker is still mounted at the root.
async function bootDeepLink() {
	vi.resetModules();
	vi.stubEnv('DEV', false);
	const router = await import('@tanstack/react-router');
	const { rootRoute } = await import('@/router/rootRoute');
	const { dashboardLayout } = await import('@/router/dashboardRoute');
	const { OverallAppSignIn } = await import('@/features/auth/store/authStore');

	const deepRoute = router.createRoute({
		getParentRoute: () => dashboardLayout,
		path: '/$organizationId/$clusterId/apps',
		component: () => null,
	});
	const signInRoute = router.createRoute({
		getParentRoute: () => rootRoute,
		path: '/sign-in',
		component: () => null,
	});
	const instance = router.createRouter({
		routeTree: rootRoute.addChildren([signInRoute, dashboardLayout.addChildren([deepRoute])]),
		history: router.createMemoryHistory({ initialEntries: ['/org-1/clu-2/apps'] }),
		context: {
			queryClient: new QueryClient(),
			authentication: { [OverallAppSignIn]: { isLoading: false, user: null } },
		},
	});

	render(<router.RouterProvider router={instance} />);
	return instance;
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe('Datadog boot view against the real router', () => {
	it('starts exactly one view when a signed-out deep link redirects to sign-in', async () => {
		const instance = await bootDeepLink();

		await waitFor(() => expect(instance.state.location.pathname).toBe('/sign-in'));

		expect(rum.startView).toHaveBeenCalledTimes(1);
		expect(rum.startView).toHaveBeenCalledWith(expect.objectContaining({ name: '/sign-in/' }));
	});
});
