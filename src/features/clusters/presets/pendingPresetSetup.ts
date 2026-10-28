import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which new clusters still owe their preset's setup, remembered in this browser from "Create cluster"
 * until the setup finishes. Read fresh from storage each time, so every tab agrees and none writes back
 * a stale copy.
 *
 * Bridges the moment between create and the first fetch that returns `Cluster.preset`, and covers a
 * central-manager that doesn't store it yet (HarperFast/central-manager#1047).
 */
const STORAGE_KEY = 'Studio:PendingPresetSetups';

type PendingSetups = Record<string, { preset: string; since: number }>;

const listeners = new Set<() => void>();
// Only for a browser whose storage refuses: the record then holds for this tab alone.
let fallback: PendingSetups = {};

function read(): PendingSetups {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === null) {
			return fallback;
		}
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return fallback;
	}
}

function write(next: PendingSetups) {
	fallback = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode: the setup can still run in this tab, it just won't be offered after a reload.
	}
	for (const listener of listeners) {
		listener();
	}
}

export function rememberPendingPresetSetup(clusterId: string, preset: string) {
	write({ ...read(), [clusterId]: { preset, since: Date.now() } });
}

export function forgetPendingPresetSetup(clusterId: string) {
	const { [clusterId]: _done, ...rest } = read();
	write(rest);
}

export function getPendingPresetSetup(clusterId: string | undefined): string | undefined {
	return clusterId ? read()[clusterId]?.preset : undefined;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY || event.key === null) {
			listener();
		}
	};
	window.addEventListener('storage', onStorage);
	return () => {
		listeners.delete(listener);
		window.removeEventListener('storage', onStorage);
	};
}

export function usePendingPresetSetup(clusterId: string | undefined): string | undefined {
	const getSnapshot = useCallback(() => getPendingPresetSetup(clusterId), [clusterId]);
	return useSyncExternalStore(subscribe, getSnapshot);
}

/** Tests only. */
export function resetPendingPresetSetupsForTests() {
	fallback = {};
}
