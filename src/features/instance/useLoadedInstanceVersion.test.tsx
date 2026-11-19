/** @vitest-environment jsdom */
import { useLoadedInstanceVersion } from '@/features/instance/useLoadedInstanceVersion';
import { QueryClient } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
	cleanup();
});

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
	});
}

// The instance layout and the child routes under it share one loader and one query, as `registrationInfoLoader`
// does, so a failure there fails both and the layout's error component shows.
function renderInstanceRoutes() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const server = { reachable: false };
	const childVersions: (string | undefined)[] = [];
	const loader = ({ context }: { context: { queryClient: QueryClient } }) =>
		context.queryClient.ensureQueryData({
			queryKey: ['registration_info', 'clu-1'],
			queryFn: async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				if (!server.reachable) { throw new Error('Network Error'); }
				return { version: '5.4.0' };
			},
		});
	const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
	const layout = createRoute({
		getParentRoute: () => root,
		id: '_instanceLayout',
		loader,
		component: Outlet,
		errorComponent: () => <p>layout failed</p>,
	});
	const start = createRoute({
		getParentRoute: () => layout,
		path: 'start',
		loader,
		component: function Start() {
			const version = useLoadedInstanceVersion();
			childVersions.push(version);
			return <p>{version === undefined ? 'waiting' : `version ${version}`}</p>;
		},
		errorComponent: ({ error }) => <p>start failed: {(error as Error).message}</p>,
	});
	const router = createRouter({
		routeTree: root.addChildren([layout.addChildren([start])]),
		history: createMemoryHistory({ initialEntries: ['/start'] }),
		context: { queryClient },
		defaultPreloadStaleTime: 0,
	});
	render(<RouterProvider router={router} />);
	return { router, server, childVersions };
}

describe('useLoadedInstanceVersion', () => {
	it('carries a child route through the render without loader data that follows a recovered layout load', async () => {
		const { router, server, childVersions } = renderInstanceRoutes();
		await settle();
		expect(screen.getByText('layout failed')).toBeTruthy();

		server.reachable = true;
		await act(async () => {
			await router.invalidate();
		});
		await settle();

		// The router's own behaviour this hook exists for: if it stops rendering the child without loader data, the
		// guard in the routes that use this hook can go.
		expect(childVersions).toContain(undefined);
		expect(screen.queryByText(/start failed/)).toBeNull();
		expect(screen.getByText('version 5.4.0')).toBeTruthy();
	});
});
