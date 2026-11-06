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

const key = (clusterId: string) => `Studio:PendingPresetSetup:${clusterId}`;
const stored = (clusterId: string) => JSON.parse(localStorage.getItem(key(clusterId)) ?? 'null');
const storedClusters = () =>
	Object.keys(localStorage).filter((name) => name.startsWith('Studio:PendingPresetSetup:')).map((name) =>
		name.slice('Studio:PendingPresetSetup:'.length)
	).sort();
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
		localStorage.removeItem(key('clu-1'));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();

		rememberPendingPresetSetup('clu-2', 'redirects');
		expect(storedClusters()).toEqual(['clu-2']);
	});

	it('keeps each cluster under its own key, so a change to one never rewrites another', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		localStorage.setItem(key('clu-2'), JSON.stringify({ preset: 'prerendering', since: 1 }));
		const setItem = vi.spyOn(Storage.prototype, 'setItem');

		forgetPendingPresetSetup('clu-1');
		rememberPendingPresetSetup('clu-3', 'redirects');
		expect(setItem.mock.calls.map(([name]) => name)).toEqual([key('clu-3')]);
		expect(storedClusters()).toEqual(['clu-2', 'clu-3']);
		expect(stored('clu-2')).toEqual({ preset: 'prerendering', since: 1 });
	});

	it('writes nothing to forget a cluster it holds no record for', () => {
		rememberPendingPresetSetup('clu-1', 'redirects');
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
		forgetPendingPresetSetup('clu-2');
		expect(setItem).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
	});

	it('holds the record for this tab when storage refuses to write it', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');

		forgetPendingPresetSetup('clu-1');
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('reads a record this tab could not forget as forgotten, though a full storage still holds it', () => {
		localStorage.setItem(key('clu-1'), JSON.stringify({ preset: 'redirects', since: 1 }));
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		forgetPendingPresetSetup('clu-1');

		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
		expect(storedClusters()).toEqual(['clu-1']);
	});

	it("drops this tab's refused record once another tab changes that cluster's key, and only then", () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		setItem.mockRestore();

		localStorage.setItem(key('clu-2'), JSON.stringify({ preset: 'prerendering', since: 1 }));
		expect(getPendingPresetSetup('clu-1')).toBe('redirects');
		localStorage.setItem(key('clu-1'), JSON.stringify({ preset: 'prerendering', since: 2 }));
		expect(getPendingPresetSetup('clu-1')).toBe('prerendering');
		localStorage.removeItem(key('clu-1'));
		expect(getPendingPresetSetup('clu-1')).toBeUndefined();
	});

	it('drops the copy once a later write succeeds, so a clear by another tab sticks', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		rememberPendingPresetSetup('clu-1', 'redirects');
		rememberPendingPresetSetup('clu-1', 'prerendering');
		expect(storedClusters()).toEqual(['clu-1']);

		localStorage.removeItem(key('clu-1'));
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
			localStorage.removeItem(key('clu-1'));
			localStorage.setItem(key('clu-2'), JSON.stringify({ preset: 'prerendering', since: 1 }));
			window.dispatchEvent(new StorageEvent('storage', { key: key('clu-2') }));
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
