/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadReoScript } = vi.hoisted(() => ({ loadReoScript: vi.fn() }));

vi.mock('reodotdev', () => ({ loadReoScript }));

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

beforeEach(() => {
	loadReoScript.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
});

describe('useReo', () => {
	it('does not let a blocked script load escape as an unhandled rejection', async () => {
		loadReoScript.mockRejectedValue(new Error('Failed to load the JS script of the agent'));

		const reasons = await collectUnhandledRejections(() => renderUseReo('client-1'));

		expect(reasons).toEqual([]);
	});

	it('does not let a throwing init escape as an unhandled rejection', async () => {
		loadReoScript.mockResolvedValue({
			init: () => {
				throw new Error('init blew up');
			},
		});

		const reasons = await collectUnhandledRejections(() => renderUseReo('client-1'));

		expect(reasons).toEqual([]);
	});

	it('does not let a synchronous loader throw escape the effect', async () => {
		loadReoScript.mockImplementation(() => {
			throw new Error('thrown before a promise exists');
		});

		const reasons = await collectUnhandledRejections(() => expect(renderUseReo('client-1')).resolves.toBeUndefined());

		expect(reasons).toEqual([]);
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
