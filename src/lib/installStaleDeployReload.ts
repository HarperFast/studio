/**
 * Recover from stale-deploy chunk failures by reloading the page once.
 *
 * Studio's assets are content-hashed; after a redeploy, a tab that loaded the
 * previous index.html can no longer fetch the old chunks. The session wedges in
 * two distinct ways, which surface through two different browser signals:
 *
 *   1. A failed lazy `import()` (a route chunk, or `@/lib/monaco/setup`) fires
 *      Vite's `vite:preloadError` window event ("Failed to fetch dynamically
 *      imported module …").
 *   2. A Monaco language worker — built as its own hashed `?worker` chunk and
 *      constructed with `new Worker(url)` — fails to load once its chunk 404s.
 *      A `new Worker()` load failure does NOT fire `vite:preloadError`; it
 *      fires the worker instance's own `error` event (verified empirically).
 *      Monaco then silently downgrades to a main-thread fallback that rejects
 *      every language-feature call with "Missing requestHandler or method: …"
 *      for the rest of the session (issue #1406). This path is easy to miss:
 *      if `@/lib/monaco/setup` was already loaded before the redeploy, no
 *      dynamic import fails — only the later worker construction does.
 *
 * `reportPossibleStaleDeploy` is the shared recovery both signals funnel into:
 * reload once to fetch the fresh index.html, whose chunk URLs all exist again
 * (the canonical recovery Vite's docs recommend). The hash router preserves the
 * user's location across the reload. `installStaleDeployReload` wires up the
 * `vite:preloadError` listener; the worker `error` hook lives in
 * `@/lib/monaco/setup` (which owns worker construction) and calls the same
 * function.
 *
 * The reload is rate-limited to a fixed cooldown from the last actual reload:
 * if reloading didn't fix things (offline, or a reload that landed on another
 * stale copy), reloading again would loop — after one recent attempt we stand
 * back and let the error surface normally.
 *
 * Idempotent: safe to call more than once (e.g. across HMR reloads).
 */

const RELOADED_AT_KEY = 'Studio:StaleDeployReloadedAt';
const RELOAD_AT_MOST_EVERY_MS = 60_000;
const stateFlag = '__harperStaleDeployReloadState__';

interface ReloadState {
	reload: () => void;
}

function reloadState(): ReloadState | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}
	return (window as Window & { [stateFlag]?: ReloadState })[stateFlag];
}

/**
 * Reload once to recover from a suspected stale deploy, rate-limited to a fixed
 * cooldown. Safe to call from any stale-deploy signal (the `vite:preloadError`
 * listener, the Monaco worker `error` hook). No-op until
 * `installStaleDeployReload` has run.
 */
export function reportPossibleStaleDeploy(): void {
	const state = reloadState();
	if (!state) {
		return;
	}
	// sessionStorage can be unavailable (disabled storage, some private modes);
	// treat that as "recently reloaded" and don't risk a reload loop.
	try {
		const reloadedAt = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
		if (Date.now() - reloadedAt < RELOAD_AT_MOST_EVERY_MS) {
			return;
		}
		// Stamp only when actually reloading — a fixed cooldown from the last
		// reload. Stamping on every event would slide the window forward and
		// suppress recovery indefinitely while failures keep arriving.
		sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
	} catch {
		return;
	}
	state.reload();
}

export function installStaleDeployReload(reload: () => void = () => window.location.reload()): void {
	if (typeof window === 'undefined') {
		return;
	}
	// One persistent listener + shared state; re-installs (HMR, tests) just swap
	// the reload callback so `reportPossibleStaleDeploy` always uses the latest.
	const globalScope = window as Window & { [stateFlag]?: ReloadState };
	const installed = globalScope[stateFlag];
	if (installed) {
		installed.reload = reload;
		return;
	}
	globalScope[stateFlag] = { reload };

	window.addEventListener('vite:preloadError', () => reportPossibleStaleDeploy());
}
