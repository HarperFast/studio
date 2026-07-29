// Global tripwire: fail any test during which React logs a render-phase
// cross-component update ("Cannot update a component (`X`) while rendering a
// different component (`Y`)"). This defect class ships silently — the suite
// stays green while every affected render pollutes the browser console (and
// Datadog RUM) in production. It has now bitten twice: the router-rebuild
// Transitioner warning (see AGENTS.md, Jul 2026) and the analytics freshness
// watcher setState-ing from a QueryCache subscription (PR #1510) — both were
// only caught by manually watching a real browser console.
//
// The match is deliberately narrow (this one React message), NOT a blanket
// console.error ban: intentional error paths (PanelErrorBoundary's
// `[panel:x] render failed`, the query-cache toast handler) log through
// console.error legitimately.
//
// A test that MUST assert this warning fires (e.g. proving a repro against a
// known-bad implementation) can capture console.error itself; replacing the
// function inside the test body takes this interceptor out of the chain for
// matching calls it swallows.
//
// DEV-MODE DEPENDENCY: this tripwire only works because React emits the
// "Cannot update a component while rendering a different component" warning
// from its DEV build (via console.error). A production React build strips that
// warning entirely, so if the test runtime is ever switched to a production
// React bundle this net silently goes green — it stops catching anything
// rather than failing loudly. Keep tests on the development build of React.
//
// TRIPWIRE-NET SELF-CHECK (#1520): a test that replaces console.error
// (`vi.spyOn(console, 'error').mockImplementation(...)`) swaps this wrapper out
// of the chain, so render-phase warnings emitted while that mock is installed
// are never seen — the net is disabled for that test. Two such tests live in
// the exact subsystems this guard protects (tabs/OverviewTab, router
// preloadEvictionRepro). We can't retroactively see a warning a mock already
// swallowed, but we CAN detect at teardown that the wrapper is no longer
// installed (the test replaced console.error and didn't restore it). A hard
// failure there would break the ~4 tests that legitimately mock console.error,
// so the chosen severity is a loud `console.warn` (through the restored real
// console.error) naming the test, plus a defensive restore so the leak doesn't
// bleed into the next test. Warn, don't throw.
import { afterEach, beforeEach } from 'vitest';

const RENDER_PHASE_UPDATE = 'Cannot update a component';

interface TripwireState {
	/** Render-phase-update messages captured during the current test. */
	offenders: string[];
	/** The wrapper we installed onto console.error in beforeEach — the identity
	 *  we compare against in afterEach to tell whether the net is still armed. */
	wrapper: typeof console.error;
	/** The real console.error captured before wrapping, restored in afterEach. */
	original: typeof console.error;
}

let state: TripwireState | undefined;

/** Wrap console.error so render-phase-update warnings are captured while still
 *  forwarding every call through to the real console.error. Returns the state
 *  needed to inspect and unwind the interception. Exported for unit testing. */
export function installTripwire(): TripwireState {
	const offenders: string[] = [];
	const original = console.error;
	const wrapper: typeof console.error = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && args[0].includes(RENDER_PHASE_UPDATE)) {
			// React logs printf-style: substitute %s args so the failure
			// message names the actual components.
			let i = 1;
			offenders.push(args[0].replace(/%s/g, () => String(args[i++] ?? '%s')));
		}
		original.apply(console, args as Parameters<typeof console.error>);
	};
	console.error = wrapper;
	return { offenders, wrapper, original };
}

/** Detect whether the tripwire net was disabled during a test: at teardown,
 *  `current` (console.error as the test left it) should still be the `wrapper`
 *  we installed. When it isn't, a test replaced console.error and never put our
 *  wrapper back — any render-phase warning it logged went unseen. Returns the
 *  warning to surface, or null when the net is still armed. Exported so the
 *  detection is unit-testable without driving the global hooks. */
export function detectDisabledNet(
	current: typeof console.error,
	wrapper: typeof console.error,
	testName: string,
): string | null {
	if (current === wrapper) { return null; }
	return `[failOnRenderPhaseUpdate] The render-phase-update tripwire was DISABLED during "${testName}" — `
		+ `console.error was replaced (e.g. vi.spyOn(console, 'error').mockImplementation) and not restored to this `
		+ `setup's wrapper, so any render-phase warning logged in that test went unseen. Restore with `
		+ `mockRestore() / vi.restoreAllMocks() (not mockReset, which leaves the spy installed) to keep the net armed.`;
}

beforeEach(() => {
	state = installTripwire();
});

afterEach((context) => {
	const s = state;
	state = undefined;
	if (!s) { return; }

	// Snapshot console.error as the test left it, then restore the real one
	// unconditionally — even if a test leaked a mock, the next test starts clean.
	const current = console.error;
	console.error = s.original;

	// Surface (but don't fail on) a test that left the tripwire net disabled.
	const disabledMessage = detectDisabledNet(current, s.wrapper, context.task.name);
	if (disabledMessage) {
		console.warn(disabledMessage);
	}

	if (s.offenders.length > 0) {
		const details = s.offenders.join('\n  ');
		const message =
			`React render-phase update detected — a component setState'd (or notified a store subscriber) while another component was rendering. `
			+ `Defer the notification (see useAnalyticsFreshness / notifyManager.batchCalls for the pattern):\n  ${details}`;
		// If the test body already failed, don't throw from the hook — a hook
		// error would shadow the primary assertion failure in the report. The
		// offender detail still reaches the log (console.error was restored just
		// above, so call it directly); the test is red either way.
		if (context.task.result?.state === 'fail') {
			console.error(`[failOnRenderPhaseUpdate] ${message}`);
			return;
		}
		throw new Error(message);
	}
});
