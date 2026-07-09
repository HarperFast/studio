/** @vitest-environment jsdom */
// Regression coverage for issue #1406: a redeploy invalidates this tab's hashed
// chunks ("Failed to fetch dynamically imported module"), wedging routes and
// Monaco's language workers. Vite reports each failure as `vite:preloadError`;
// we recover by reloading once, without looping when reloading can't help.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installStaleDeployReload } from './installStaleDeployReload';

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

	it('is idempotent across repeated installs (HMR)', () => {
		const reload = vi.fn();
		installStaleDeployReload(reload);
		installStaleDeployReload(reload);
		firePreloadError();
		expect(reload).toHaveBeenCalledTimes(1);
	});
});
