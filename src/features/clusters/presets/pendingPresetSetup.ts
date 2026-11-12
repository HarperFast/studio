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
const KEY_PREFIX = 'Studio:PendingPresetSetup:';

/** One key per cluster, so two tabs changing different clusters never write over each other. */
function storageKey(clusterId: string): string {
	return KEY_PREFIX + clusterId;
}

type PendingSetup = { preset: string; since: number };

/**
 * Records storage refused to write (full, or private mode), for this tab alone, with the value storage
 * held for that key when it refused. Each wins over that older value, which a full storage still holds,
 * and gives way once another tab changes the key: a copy kept past that would bring back a record the
 * other tab cleared.
 */
const fallback = new Map<string, { entry: PendingSetup | undefined; over: string | null }>();

function read(clusterId: string): PendingSetup | undefined {
	let stored: string | null;
	try {
		stored = localStorage.getItem(storageKey(clusterId));
	} catch {
		return fallback.get(clusterId)?.entry;
	}
	const held = fallback.get(clusterId);
	if (held) {
		if (stored === held.over) {
			return held.entry;
		}
		fallback.delete(clusterId);
	}
	return parse(stored);
}

function parse(stored: string | null): PendingSetup | undefined {
	if (stored === null) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(stored);
		return parsed && typeof parsed === 'object' && typeof (parsed as PendingSetup).preset === 'string'
			? parsed as PendingSetup
			: undefined;
	} catch {
		return undefined;
	}
}

function update(clusterId: string, entry: PendingSetup | undefined) {
	if (!read(clusterId) && !entry) {
		return;
	}
	const key = storageKey(clusterId);
	try {
		if (entry) {
			localStorage.setItem(key, JSON.stringify(entry));
		} else {
			localStorage.removeItem(key);
		}
		fallback.delete(clusterId);
	} catch {
		// The setup can still run in this tab, it just won't be offered after a reload.
		fallback.set(clusterId, { entry, over: storedOrNull(key) });
	}
	notify();
}

// Storage that cannot be read at all never gets as far as comparing against this.
function storedOrNull(key: string): string | null {
	try {
		return localStorage.getItem(key);
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
	return clusterId ? read(clusterId)?.preset : undefined;
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
	if (event.key === null || event.key.startsWith(KEY_PREFIX)) {
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
	fallback.clear();
}
