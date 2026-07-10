/** @vitest-environment jsdom */
// Regression coverage for issue #1406: a redeploy invalidates this tab's hashed
// chunks, wedging routes and Monaco's language workers. Two distinct signals
// reach us — Vite's `vite:preloadError` (failed dynamic import) and a Monaco
// worker's own `error` event (failed `new Worker()`, which does NOT fire
// `vite:preloadError`) — and both funnel into one rate-limited reload.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaleDeployReload, reportPossibleStaleDeploy } from './installStaleDeployReload';

function firePreloadError() {
	window.dispatchEvent(new Event('vite:preloadError'));
}

describe('installStaleDeployReload', () => {
	beforeEach(() => {
		sessionStorage.clear();
		// Re-installing swaps the active reload callback onto this test's mock.
	});

	it('reloads on the first stale-chunk failure', () => {
		const reload = vi.fn();
		installStaleDeployReload(reload);
		firePreloadError();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload again within the rate-limit window', () => {
		const reload = vi.fn();
		installStaleDeployReload(reload);
		firePreloadError();
		firePreloadError();
		firePreloadError();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('respects a recent reload recorded by a previous page load', () => {
		// The reload itself re-runs main.tsx; the persisted timestamp is what
		// prevents a reload loop when the failure persists (e.g. offline).
		sessionStorage.setItem('Studio:StaleDeployReloadedAt', String(Date.now() - 1000));
		const reload = vi.fn();
		installStaleDeployReload(reload);
		firePreloadError();
		expect(reload).not.toHaveBeenCalled();
	});

	it('reloads again once the rate-limit window has passed', () => {
		sessionStorage.setItem('Studio:StaleDeployReloadedAt', String(Date.now() - 120_000));
		const reload = vi.fn();
		installStaleDeployReload(reload);
		firePreloadError();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not let suppressed failures slide the cooldown window forward', () => {
		// The cooldown is fixed from the last actual reload: a stream of failures
		// arriving faster than the window (e.g. the reload landed on another stale
		// copy of the app) must not postpone recovery indefinitely.
		vi.useFakeTimers();
		try {
			const reload = vi.fn();
			installStaleDeployReload(reload);
			firePreloadError();
			expect(reload).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(30_000);
			firePreloadError();
			expect(reload).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(40_000);
			firePreloadError();
			expect(reload).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('is idempotent across repeated installs (HMR)', () => {
		const reload = vi.fn();
		installStaleDeployReload(reload);
		installStaleDeployReload(reload);
		firePreloadError();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	// Regression for the gap Kris flagged in #1435: a stale Monaco worker chunk
	// fires the worker's own `error` event, not `vite:preloadError`. The worker
	// hook in `@/lib/monaco/setup` calls `reportPossibleStaleDeploy` directly.
	it('reloads when the worker hook reports a stale deploy directly', () => {
		const reload = vi.fn();
		installStaleDeployReload(reload);
		reportPossibleStaleDeploy();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('shares one rate-limit budget across preload and worker signals', () => {
		// A single stale deploy fails both a dynamic import and a worker load; the
		// two signals must not each earn their own reload.
		const reload = vi.fn();
		installStaleDeployReload(reload);
		firePreloadError();
		reportPossibleStaleDeploy();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('is a no-op before install (worker error before main.tsx wired it up)', () => {
		// reportPossibleStaleDeploy must not throw if a worker somehow errors
		// before installStaleDeployReload has run.
		delete (window as Window & { __harperStaleDeployReloadState__?: unknown }).__harperStaleDeployReloadState__;
		expect(() => reportPossibleStaleDeploy()).not.toThrow();
	});

	it('does not reload when sessionStorage is unavailable', () => {
		// Disabled storage / some private modes throw on access — bail rather than
		// reload blind (which could loop with no persisted cooldown to stop it).
		const reload = vi.fn();
		installStaleDeployReload(reload);
		const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('storage disabled');
		});
		try {
			firePreloadError();
			expect(reload).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	it('installs with the default window.location.reload when no callback is given', () => {
		// Exercises the default argument; a persisted cooldown suppresses the actual
		// reload so jsdom never attempts navigation.
		sessionStorage.setItem('Studio:StaleDeployReloadedAt', String(Date.now()));
		expect(() => {
			installStaleDeployReload();
			firePreloadError();
		}).not.toThrow();
	});
});
