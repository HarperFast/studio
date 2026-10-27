import { useSyncExternalStore } from 'react';

/**
 * Which new clusters still owe their preset's setup, remembered in this browser from "Create cluster"
 * until the setup finishes.
 *
 * Interim: central-manager has no field for a cluster's preset yet, so another browser, or this one
 * after its storage is cleared, can't tell the cluster was built for a job. Once the Cluster record
 * carries it, that becomes the source and this only bridges the moment between create and the first
 * fetch.
 */
const STORAGE_KEY = 'Studio:PendingPresetSetups';

type PendingSetups = Record<string, { preset: string; since: number }>;

const listeners = new Set<() => void>();
let cache: PendingSetups | undefined;

function read(): PendingSetups {
	if (cache) {
		return cache;
	}
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
		cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		cache = {};
	}
	return cache!;
}

function write(next: PendingSetups) {
	cache = next;
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

export function usePendingPresetSetup(clusterId: string | undefined): string | undefined {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => getPendingPresetSetup(clusterId),
	);
}

/** Tests only. */
export function resetPendingPresetSetupsForTests() {
	cache = undefined;
}
