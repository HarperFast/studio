/**
 * @vitest-environment jsdom
 */
import { clusterEditRoutes } from '@/features/clusters/routes';
import {
	type AnyRoute,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
	useParams,
} from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

describe('the cluster edit routes', () => {
	it('mount a fresh editor when moving from the Version page to Scaling', async () => {
		const mounts: (string | undefined)[] = [];
		function Editor() {
			const { mode } = useParams({ strict: false }) as { mode?: string };
			useEffect(() => {
				mounts.push(mode);
				// Mount-only on purpose: a re-render with a new mode is the bug this pins.
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);
			return <p>{mode ?? 'scaling'}</p>;
		}
		const root = createRootRoute({ component: Outlet });
		const routes = clusterEditRoutes.map((route) => {
			const { path, remountDeps } = route.options as { path: string; remountDeps?: unknown };
			return createRoute({ getParentRoute: () => root, path, remountDeps: remountDeps as never, component: Editor });
		});
		const router = createRouter({
			routeTree: root.addChildren(routes as AnyRoute[]),
			history: createMemoryHistory({ initialEntries: ['/edit/version'] }),
		});
		render(<RouterProvider router={router as never} />);
		await screen.findByText('version');

		await act(() => router.navigate({ to: '/edit' as never }));
		await screen.findByText('scaling');

		expect(mounts).toEqual(['version', undefined]);
	});
});
