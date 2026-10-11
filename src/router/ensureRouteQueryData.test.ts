/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: () => ({
		queryKey: ['registration-info'],
		queryFn: () => new Promise(() => undefined),
	}),
}));

import { authStore } from '@/features/auth/store/authStore';
import { registrationInfoLoader } from '@/features/instance/registrationInfoLoader';
import { isCancelledError, QueryClient } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRouteWithContext,
	createRoute,
	createRouter,
	redirect,
} from '@tanstack/react-router';
import { ensureRouteQueryData } from './ensureRouteQueryData';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function outcome(promise: Promise<unknown>) {
	return Promise.race([
		promise.then(() => 'resolved', (error: unknown) => error),
		flush().then(() => 'pending'),
	]);
}

let queryClient: QueryClient;

beforeEach(() => {
	localStorage.clear();
	queryClient = new QueryClient();
});

describe('ensureRouteQueryData', () => {
	it('leaves a load whose data a sign-out cancelled for the router to abandon', async () => {
		const load = ensureRouteQueryData(queryClient, { queryKey: ['k'], queryFn: () => new Promise(() => undefined) });

		authStore.signOutAllLocally();
		queryClient.getQueryCache().clear();

		await expect(outcome(load)).resolves.toBe('pending');
	});

	it('rethrows a cancellation no sign-out caused', async () => {
		const load = ensureRouteQueryData(queryClient, { queryKey: ['k'], queryFn: () => new Promise(() => undefined) });

		queryClient.getQueryCache().clear();

		expect(isCancelledError(await outcome(load))).toBe(true);
	});

	it('rethrows a real failure even after a sign-out', async () => {
		const failure = new Error('Request failed with status code 403');
		const load = ensureRouteQueryData(queryClient, {
			queryKey: ['k'],
			queryFn: () => Promise.reject(failure),
			retry: false,
		});

		authStore.signOutAllLocally();

		await expect(outcome(load)).resolves.toBe(failure);
	});

	it('does not leave a router loader stuck on the abandoned load after signing back in', async () => {
		const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient; signedIn: boolean }>()();
		const guarded = createRoute({
			getParentRoute: () => rootRoute,
			id: 'guarded',
			beforeLoad: ({ context }) => {
				if (!context.signedIn) {
					throw redirect({ to: '/sign-in' });
				}
			},
		});
		const dataRoute = createRoute({
			getParentRoute: () => guarded,
			path: 'data',
			loader: ({ context }) => ensureRouteQueryData(context.queryClient, { queryKey: ['data'], queryFn: fetchData }),
		});
		const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: 'sign-in' });
		const fetchData = vi.fn<() => Promise<string>>()
			.mockReturnValueOnce(new Promise(() => undefined))
			.mockResolvedValueOnce('fresh');
		const router = createRouter({
			routeTree: rootRoute.addChildren([guarded.addChildren([dataRoute]), signInRoute]),
			history: createMemoryHistory({ initialEntries: ['/data'] }),
			context: { queryClient, signedIn: true },
		});
		void router.load();
		await flush();

		authStore.signOutAllLocally();
		queryClient.getQueryCache().clear();
		router.update({ ...router.options, context: { queryClient, signedIn: false } });
		await router.invalidate();
		expect(router.state.location.pathname).toBe('/sign-in');

		router.update({ ...router.options, context: { queryClient, signedIn: true } });
		await expect(outcome(router.navigate({ to: '/data' }))).resolves.toBe('resolved');
		expect(router.state.location.pathname).toBe('/data');
		expect(router.state.matches.at(-1)?.loaderData).toBe('fresh');
	});

	it('backs the instance routes’ registration-info loader', async () => {
		const load = registrationInfoLoader({
			context: { queryClient },
			params: { organizationId: 'org-a', clusterId: 'clu-a', instanceId: 'ins-a' },
		});

		authStore.signOutAllLocally();
		queryClient.getQueryCache().clear();

		await expect(outcome(load)).resolves.toBe('pending');
	});
});
