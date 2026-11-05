import { clusterPresetsEnabled } from '@/config/constants';
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

type PendingSetup = { preset: string; since: number };
type PendingSetups = Record<string, PendingSetup>;

/**
 * A record storage refused to write (full, or private mode), for this tab alone, with the value storage
 * held when it refused. It wins over that older value, which a full storage still holds, and gives way
 * once another tab changes the key: a copy kept past that would bring back a record the other tab cleared.
 */
let fallback: { setups: PendingSetups; over: string | null } | undefined;

function read(): PendingSetups {
	let stored: string | null;
	try {
		stored = localStorage.getItem(STORAGE_KEY);
	} catch {
		return fallback?.setups ?? {};
	}
	if (fallback) {
		if (stored === fallback.over) {
			return fallback.setups;
		}
		fallback = undefined;
	}
	if (stored === null) {
		return {};
	}
	try {
		const parsed = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * Re-reads right before writing and changes only this cluster's entry, so what another tab wrote for
 * any other cluster in the meantime is kept.
 */
function update(clusterId: string, entry: PendingSetup | undefined) {
	const { [clusterId]: previous, ...others } = read();
	if (!previous && !entry) {
		return;
	}
	const next = entry ? { ...others, [clusterId]: entry } : others;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		fallback = undefined;
	} catch {
		// The setup can still run in this tab, it just won't be offered after a reload.
		fallback = { setups: next, over: storedOrNull() };
	}
	notify();
}

// Storage that cannot be read at all never gets as far as comparing against this.
function storedOrNull(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function rememberPendingPresetSetup(clusterId: string, preset: string) {
	update(clusterId, { preset, since: Date.now() });
}

export function forgetPendingPresetSetup(clusterId: string) {
	update(clusterId, undefined);
}

export function getPendingPresetSetup(clusterId: string | undefined): string | undefined {
	return clusterId ? read()[clusterId]?.preset : undefined;
}

// One `storage` listener for the whole page however many cluster cards read the record, installed by the
// first subscriber and removed with the last.
const listeners = new Set<() => void>();

function notify() {
	for (const listener of listeners) {
		listener();
	}
}

function onStorage(event: StorageEvent) {
	if (event.key === STORAGE_KEY || event.key === null) {
		notify();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1) {
		window.addEventListener('storage', onStorage);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			window.removeEventListener('storage', onStorage);
		}
	};
}

const subscribeToNothing = () => () => undefined;

/** Reads nothing and listens to nothing in a build without presets, where no record can be acted on. */
export function usePendingPresetSetup(clusterId: string | undefined): string | undefined {
	const getSnapshot = useCallback(
		() => clusterPresetsEnabled ? getPendingPresetSetup(clusterId) : undefined,
		[clusterId],
	);
	return useSyncExternalStore(clusterPresetsEnabled ? subscribe : subscribeToNothing, getSnapshot);
}

export function resetPendingPresetSetupsForTests() {
	fallback = undefined;
}
