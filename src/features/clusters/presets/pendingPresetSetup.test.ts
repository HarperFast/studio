/** @vitest-environment jsdom */
import {
	forgetPendingPresetSetup,
	getPendingPresetSetup,
	rememberPendingPresetSetup,
	resetPendingPresetSetupsForTests,
	usePendingPresetSetup,
} from '@/features/clusters/presets/pendingPresetSetup';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { build } = vi.hoisted(() => ({ build: { presets: true } }));
vi.mock('@/config/constants', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/config/constants')>()),
	get clusterPresetsEnabled() {
		return build.presets;
	},
}));

const KEY = 'Studio:PendingPresetSetups';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const storageListeners = (spy: { mock: { calls: unknown[][] } }) =>
	spy.mock.calls.filter(([type]) => type === 'storage').length;

beforeEach(() => {
	build.presets = true;
	localStorage.clear();
	resetPendingPresetSetupsForTests();
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('pendingPresetSetup storage', () => {
	it('never brings back a record another tab cleared', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		localStorage.removeItem(KEY);
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();

		rememberPendingPresetSetup('clu-2', 'redirects');
		expect(Object.keys(stored())).toEqual(['clu-2']);
	});

	it('keeps what another tab wrote for other clusters when it changes one', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		localStorage.setItem(KEY, JSON.stringify({ ...stored(), 'clu-2': { preset: 'prerendering', since: 1 } }));

		forgetPendingPresetSetup('clu-1');
		expect(stored()).toEqual({ 'clu-2': { preset: 'prerendering', since: 1 } });
	});

	it('writes nothing to forget a cluster it holds no record for', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		forgetPendingPresetSetup('clu-2');
		expect(setItem).not.toHaveBeenCalled();
	});

	it('holds the record for this tab when storage refuses to write it', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');

		forgetPendingPresetSetup('clu-1');
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('reads a record this tab could not forget as forgotten, though a full storage still holds it', () => {
		localStorage.setItem(KEY, JSON.stringify({ 'clu-1': { preset: 'redirects', since: 1 } }));
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		forgetPendingPresetSetup('clu-1');

		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
		expect(Object.keys(stored())).toEqual(['clu-1']);
	});

	it("drops this tab's refused record once another tab changes the key", () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		setItem.mockRestore();

		localStorage.setItem(KEY, JSON.stringify({ 'clu-2': { preset: 'prerendering', since: 1 } }));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
		localStorage.removeItem(KEY);
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('drops the copy once a later write succeeds, so a clear by another tab sticks', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		rememberPendingPresetSetup('clu-2', 'redirects');
		expect(Object.keys(stored())).toEqual(['clu-1', 'clu-2']);

		localStorage.removeItem(KEY);
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});
});

describe('usePendingPresetSetup', () => {
	it('shares one storage listener among every reader, removed with the last', () => {
		const add = vi.spyOn(window, 'addEventListener');
		const remove = vi.spyOn(window, 'removeEventListener');
		const first = renderHook(() => usePendingPresetSetup('clu-1'));
		const second = renderHook(() => usePendingPresetSetup('clu-2'));
		expect(storageListeners(add)).toBe(1);

		first.unmount();
		expect(storageListeners(remove)).toBe(0);
		second.unmount();
		expect(storageListeners(remove)).toBe(1);
	});

	it('updates every reader when this tab or another one changes the record', () => {
		const first = renderHook(() => usePendingPresetSetup('clu-1'));
		const second = renderHook(() => usePendingPresetSetup('clu-2'));

		act(() => rememberPendingPresetSetup('clu-1', 'redirects'));
		expect(first.result.current).toBe('redirects');

		act(() => {
			localStorage.setItem(KEY, JSON.stringify({ 'clu-2': { preset: 'prerendering', since: 1 } }));
			window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
		});
		expect(first.result.current).toBeUndefined();
		expect(second.result.current).toBe('prerendering');
	});

	it('reads and listens to nothing in a build without presets', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		build.presets = false;
		const add = vi.spyOn(window, 'addEventListener');
		const getItem = vi.spyOn(Storage.prototype, 'getItem');

		const { result } = renderHook(() => usePendingPresetSetup('clu-1'));
		expect(result.current).toBeUndefined();
		expect(storageListeners(add)).toBe(0);
		expect(getItem).not.toHaveBeenCalled();
	});
});
