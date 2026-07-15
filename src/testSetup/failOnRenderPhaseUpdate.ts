// Global tripwire: fail any test during which React logs a render-phase
// cross-component update ("Cannot update a component (`X`) while rendering a
// different component (`Y`)"). This defect class ships silently — the suite
// stays green while every affected render pollutes the browser console (and
// Datadog RUM) in production. It has now bitten twice: the router-rebuild
// Transitioner warning (see CLAUDE.md, Jul 2026) and the analytics freshness
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
import { afterEach, beforeEach } from 'vitest';

const RENDER_PHASE_UPDATE = 'Cannot update a component';

let offenders: string[] = [];
let interceptedError: typeof console.error | undefined;

beforeEach(() => {
	offenders = [];
	const original = console.error;
	interceptedError = original;
	console.error = (...args: unknown[]) => {
		if (typeof args[0] === 'string' && args[0].includes(RENDER_PHASE_UPDATE)) {
			// React logs printf-style: substitute %s args so the failure
			// message names the actual components.
			let i = 1;
			offenders.push(args[0].replace(/%s/g, () => String(args[i++] ?? '%s')));
		}
		original.apply(console, args as Parameters<typeof console.error>);
	};
});

afterEach(() => {
	if (interceptedError) {
		console.error = interceptedError;
		interceptedError = undefined;
	}
	if (offenders.length > 0) {
		const details = offenders.join('\n  ');
		offenders = [];
		throw new Error(
			`React render-phase update detected — a component setState'd (or notified a store subscriber) while another component was rendering. `
				+ `Defer the notification (see useAnalyticsFreshness / notifyManager.batchCalls for the pattern):\n  ${details}`,
		);
	}
});
