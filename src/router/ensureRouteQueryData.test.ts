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
import { isClaimedByRoute } from '@/react-query/routeQueryClaims';
import { isCancelledError, QueryCache, QueryClient } from '@tanstack/react-query';
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

function routeLoad({ preload = false, abortController = new AbortController() } = {}) {
	return { context: { queryClient }, abortController, preload };
}

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function claimed(queryHash = '["k"]') {
	const query = queryClient.getQueryCache().get(queryHash);
	return query !== undefined && isClaimedByRoute(query);
}

beforeEach(() => {
	localStorage.clear();
	queryClient = new QueryClient();
});

describe('ensureRouteQueryData', () => {
	it('leaves a load whose data a sign-out cancelled for the router to abandon', async () => {
		const load = ensureRouteQueryData(routeLoad(), {
			queryKey: ['k'],
			queryFn: () => new Promise(() => undefined),
		});

		authStore.signOutAllLocally();
		queryClient.getQueryCache().clear();

		await expect(outcome(load)).resolves.toBe('pending');
	});

	it('rethrows a cancellation no sign-out caused', async () => {
		const load = ensureRouteQueryData(routeLoad(), {
			queryKey: ['k'],
			queryFn: () => new Promise(() => undefined),
		});

		queryClient.getQueryCache().clear();

		expect(isCancelledError(await outcome(load))).toBe(true);
	});

	it('rethrows a real failure even after a sign-out', async () => {
		const failure = new Error('Request failed with status code 403');
		const load = ensureRouteQueryData(routeLoad(), {
			queryKey: ['k'],
			queryFn: () => Promise.reject(failure),
			retry: false,
		});

		authStore.signOutAllLocally();

		await expect(outcome(load)).resolves.toBe(failure);
	});

	it('claims the query it reads while the route awaits it, and only then', async () => {
		const read = deferred<string>();
		const load = ensureRouteQueryData(routeLoad(), { queryKey: ['k'], queryFn: () => read.promise });

		expect(claimed()).toBe(true);
		read.resolve('data');
		await expect(load).resolves.toBe('data');
		expect(claimed()).toBe(false);
	});

	it('is still claiming when the query cache reports the failure, and lets go after', async () => {
		const claimedWhenReported: boolean[] = [];
		queryClient = new QueryClient({
			queryCache: new QueryCache({ onError: (_error, query) => claimedWhenReported.push(isClaimedByRoute(query)) }),
		});
		const failure = new Error('Request failed with status code 500');

		await expect(
			ensureRouteQueryData(routeLoad(), { queryKey: ['k'], queryFn: () => Promise.reject(failure), retry: false }),
		).rejects.toBe(failure);

		expect(claimedWhenReported).toEqual([true]);
		expect(claimed()).toBe(false);
	});

	it('claims the same query object ensureQueryData reads under a custom key hash', async () => {
		const read = deferred<string>();
		const load = ensureRouteQueryData(routeLoad(), {
			queryKey: ['k'],
			queryKeyHashFn: (queryKey) => `custom:${JSON.stringify(queryKey)}`,
			queryFn: () => read.promise,
		});

		expect(claimed('custom:["k"]')).toBe(true);
		read.resolve('data');
		await load;
	});

	it('lets go as soon as the router abandons the load', () => {
		const abortController = new AbortController();
		void ensureRouteQueryData(routeLoad({ abortController }), {
			queryKey: ['k'],
			queryFn: () => new Promise(() => undefined),
		});

		abortController.abort();

		expect(claimed()).toBe(false);
	});

	it('does not claim for a preload, which renders nothing', () => {
		void ensureRouteQueryData(routeLoad({ preload: true }), {
			queryKey: ['k'],
			queryFn: () => new Promise(() => undefined),
		});

		expect(claimed()).toBe(false);
	});

	it('does not claim a read the cache answers, which cannot fail into the route', async () => {
		queryClient.setQueryData(['k'], 'cached');
		const load = ensureRouteQueryData(routeLoad(), { queryKey: ['k'], queryFn: () => new Promise(() => undefined) });

		expect(claimed()).toBe(false);
		await expect(load).resolves.toBe('cached');
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
			loader: (opts) => ensureRouteQueryData(opts, { queryKey: ['data'], queryFn: fetchData }),
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
			...routeLoad(),
			params: { organizationId: 'org-a', clusterId: 'clu-a', instanceId: 'ins-a' },
		});
		expect(claimed('["registration-info"]')).toBe(true);

		authStore.signOutAllLocally();
		queryClient.getQueryCache().clear();

		await expect(outcome(load)).resolves.toBe('pending');
	});
});
