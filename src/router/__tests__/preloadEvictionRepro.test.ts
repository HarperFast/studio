import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * Regression coverage for the RUM error tracked in #1387:
 *   TypeError: Cannot read properties of undefined (reading '_nonReactive')
 *     at ... async preloadRoute
 *
 * When a hover-intent preload's cached match is evicted while its loader is
 * still in flight (real navigation, router.invalidate(), or cache GC),
 * @tanstack/router-core@1.171.14 re-reads the match after an await and
 * dereferences `._nonReactive` without a guard, then console.error()s the
 * TypeError from preloadRoute — which Datadog RUM records on every
 * hover-then-navigate race. Upstream report: TanStack/router#7759; we
 * carried the fix from TanStack/router#7003 as
 * patches/@tanstack__router-core@1.171.15.patch until upstream's own fix
 * (TanStack/router#7805, released in router-core@1.171.16) made the patch
 * redundant — this file now just guards against a regression.
 *
 * router-core@1.171.16 dropped the old `clearExpiredCache()` (which swept
 * only matches past their gcTime) in favor of `clearCache()`, an
 * unconditional flush — expiration-based pruning now happens inline during
 * navigation commits instead of via a standalone sweep. The tests below use
 * `clearCache()` to force the same "match evicted mid-flight" condition;
 * they exercise an explicit cache clear, not GC-driven expiration.
 */
describe('preloadRoute survives its match being evicted mid-flight', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function setup(loader: () => Promise<unknown>) {
		const rootRoute = createRootRoute({});
		const fooRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/foo',
			loader,
			preloadGcTime: 0,
		});
		const barRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/bar',
			loader: () => ({ ok: true }),
		});
		const router = createRouter({
			routeTree: rootRoute.addChildren([fooRoute, barRoute]),
			history: createMemoryHistory(),
			defaultPreloadGcTime: 0,
		});
		return { router, fooRoute };
	}

	test('clearing the cache while a preload is in-flight does not console.error a TypeError', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let resolveLoader: ((value: { ok: true }) => void) | undefined;
		const { router } = setup(
			() =>
				new Promise((resolve) => {
					resolveLoader = resolve;
				}),
		);

		const preloadPromise = router.preloadRoute({ to: '/foo' });
		await Promise.resolve();

		router.clearCache();

		resolveLoader?.({ ok: true });
		await expect(preloadPromise).resolves.toBeUndefined();

		// preloadRoute swallows load errors via console.error(err) — that is
		// exactly what RUM picks up, so the assertion is on console.error.
		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('invalidate() during an in-flight preload does not console.error a TypeError', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let resolveLoader: ((value: { ok: true }) => void) | undefined;
		const { router } = setup(
			() =>
				new Promise((resolve) => {
					resolveLoader = resolve;
				}),
		);

		await router.navigate({ to: '/bar' });

		const preloadPromise = router.preloadRoute({ to: '/foo' });
		await Promise.resolve();

		const invalidatePromise = router.invalidate();
		await Promise.resolve();

		resolveLoader?.({ ok: true });
		await expect(preloadPromise).resolves.toBeUndefined();
		await invalidatePromise;

		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});

	test('eviction during concurrent preloads of the same route cleans up without errors or hangs', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let resolveLoader: ((value: { ok: true }) => void) | undefined;
		const { router } = setup(
			() =>
				new Promise((resolve) => {
					resolveLoader = resolve;
				}),
		);

		// second preload of the same route joins the first one's in-flight
		// loaderPromise (the concurrent-load branch of loadRouteMatch)
		const firstPreload = router.preloadRoute({ to: '/foo' });
		await Promise.resolve();
		const secondPreload = router.preloadRoute({ to: '/foo' });
		await Promise.resolve();

		router.clearCache();

		resolveLoader?.({ ok: true });
		// both preloads must settle (eviction cleanup resolves the controlled
		// promises the second preload is parked on) and neither may console.error
		await expect(firstPreload).resolves.toBeUndefined();
		await expect(secondPreload).resolves.toBeUndefined();

		expect(consoleErrorSpy).not.toHaveBeenCalled();
	});
});
