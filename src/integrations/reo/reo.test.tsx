/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';

const { loadReoScript } = vi.hoisted(() => ({ loadReoScript: vi.fn() }));

vi.mock('reodotdev', () => ({ loadReoScript }));

let consoleError: MockInstance<Console['error']>;
let consoleDebug: MockInstance<Console['debug']>;

async function renderUseReo(clientID: string) {
	vi.resetModules();
	vi.stubEnv('VITE_REO_DEV_CLIENT_ID', clientID);
	const { useReo } = await import('./reo');
	function Host() {
		useReo();
		return null;
	}
	render(<Host />);
}

/**
 * Node reports an unhandled rejection on the macrotask turn after the microtask queue drains,
 * so the flush has to cross a timer rather than just awaiting.
 */
async function collectUnhandledRejections(act: () => Promise<void>) {
	const reasons: unknown[] = [];
	const onUnhandled = (reason: unknown) => reasons.push(reason);
	process.on('unhandledRejection', onUnhandled);
	try {
		await act();
		await new Promise((resolve) => setTimeout(resolve, 0));
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
	return reasons;
}

/**
 * Terminating the rejection is only half the contract: the RUM SDK collects `console.error` as an
 * error event (`source: "console"`), so reporting the swallowed failure through that channel would
 * re-create the Error Tracking issue this catch exists to remove. Asserting the absence of
 * `console.error` is what keeps a later "just log it" edit from silently undoing the fix.
 */
function expectReportedToDebug(failure: Error) {
	expect(consoleDebug).toHaveBeenCalledWith(expect.any(String), failure);
	expect(consoleError).not.toHaveBeenCalled();
}

beforeEach(() => {
	loadReoScript.mockReset();
	// Left calling through, so the global render-phase-update tripwire's wrapper still sees every
	// console.error while these tests run; only the deliberate diagnostic noise is silenced.
	consoleError = vi.spyOn(console, 'error');
	consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	// mockRestore (not mockReset) un-installs the spies so the global render-phase-update
	// tripwire's console.error wrapper is back in place at teardown — mockReset leaves the spy
	// installed, which the tripwire self-check (failOnRenderPhaseUpdate #1520) flags.
	consoleError.mockRestore();
	consoleDebug.mockRestore();
});

describe('useReo', () => {
	it('does not let a blocked script load escape as an unhandled rejection', async () => {
		const failure = new Error('Failed to load the JS script of the agent');
		loadReoScript.mockRejectedValue(failure);

		const reasons = await collectUnhandledRejections(() => renderUseReo('client-1'));

		expect(reasons).toEqual([]);
		expectReportedToDebug(failure);
	});

	it('does not let a throwing init escape as an unhandled rejection', async () => {
		const failure = new Error('init blew up');
		loadReoScript.mockResolvedValue({
			init: () => {
				throw failure;
			},
		});

		const reasons = await collectUnhandledRejections(() => renderUseReo('client-1'));

		expect(reasons).toEqual([]);
		expectReportedToDebug(failure);
	});

	it('does not let a synchronous loader throw escape the effect', async () => {
		const failure = new Error('thrown before a promise exists');
		loadReoScript.mockImplementation(() => {
			throw failure;
		});

		const reasons = await collectUnhandledRejections(() => expect(renderUseReo('client-1')).resolves.toBeUndefined());

		expect(reasons).toEqual([]);
		expectReportedToDebug(failure);
	});

	it('initialises Reo with the client id when the script loads', async () => {
		const init = vi.fn();
		loadReoScript.mockResolvedValue({ init });

		await renderUseReo('client-1');
		await vi.waitFor(() => expect(init).toHaveBeenCalledWith({ clientID: 'client-1' }));

		expect(loadReoScript).toHaveBeenCalledWith({ clientID: 'client-1' });
	});

	it.each(['', '0'])('does not load the script when the client id is %o', async (clientID) => {
		await renderUseReo(clientID);

		expect(loadReoScript).not.toHaveBeenCalled();
	});
});
