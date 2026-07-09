/**
 * Recover from stale-deploy chunk failures by reloading the page once.
 *
 * Studio's assets are content-hashed; after a redeploy, a tab that loaded the
 * previous index.html can no longer fetch the old lazy chunks and Vite surfaces
 * "Failed to fetch dynamically imported module …". The session is then wedged:
 * routes fail to load, and Monaco's language workers (also hashed assets) fail
 * to spawn, silently downgrading to a main-thread fallback that rejects every
 * language-feature call with "Missing requestHandler or method: …" for the
 * rest of the session (issue #1406).
 *
 * Vite reports every failed dynamic import (and failed preloaded dependency)
 * via the `vite:preloadError` window event. Reloading fetches the fresh
 * index.html, whose chunk URLs all exist again — the canonical recovery Vite's
 * docs recommend. The hash router preserves the user's location across reload.
 *
 * The reload is rate-limited: if a reload didn't fix the imports (e.g. the
 * user is offline, so every fetch fails), reloading again would loop — after
 * one recent attempt we stand back and let the error surface normally.
 *
 * Idempotent: safe to call more than once (e.g. across HMR reloads).
 */

const RELOADED_AT_KEY = 'Studio:StaleDeployReloadedAt';
const RELOAD_AT_MOST_EVERY_MS = 60_000;
const installFlag = '__harperStaleDeployReloadInstalled__';

export function installStaleDeployReload(reload: () => void = () => window.location.reload()): void {
	if (typeof window === 'undefined') {
		return;
	}
	// One persistent listener; re-installs (HMR, tests) just swap the callback.
	const globalScope = window as Window & { [installFlag]?: { reload: () => void } };
	const installed = globalScope[installFlag];
	if (installed) {
		installed.reload = reload;
		return;
	}
	const state = { reload };
	globalScope[installFlag] = state;

	window.addEventListener('vite:preloadError', () => {
		// sessionStorage can be unavailable (disabled storage, some private modes);
		// treat that as "recently reloaded" and don't risk a reload loop.
		let reloadedAt: number;
		try {
			reloadedAt = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
			sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
		} catch {
			return;
		}
		if (Date.now() - reloadedAt < RELOAD_AT_MOST_EVERY_MS) {
			return;
		}
		state.reload();
	});
}
