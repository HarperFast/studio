import { nextObservationStamp } from '@/lib/restart/restartTracker';
import { useSyncExternalStore } from 'react';

export interface PendingSave {
	target: boolean;
	/** Stamped like a cluster read, so no read requested before the save can tie with it. */
	at: number;
	/** Wall-clock time, for the grace timer. */
	savedAt: number;
}

/**
 * Saves whose roll no page has seen yet, by cluster. Module state rather than component state, so
 * leaving the page during the gap and coming back still reads the gap as the roll starting, instead
 * of offering Try again over a roll that is about to begin.
 */
const pending = new Map<string, PendingSave>();
const listeners = new Set<() => void>();

function changed() {
	for (const listener of listeners) {
		listener();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** A page mounted before its save settles still sees it: the save lands after the PUT answers. */
export function usePendingSave(clusterId: string): PendingSave | null {
	return useSyncExternalStore(subscribe, () => pendingSave(clusterId));
}

export function rememberSave(clusterId: string, target: boolean) {
	pending.set(clusterId, { target, at: nextObservationStamp(), savedAt: Date.now() });
	changed();
}

export function pendingSave(clusterId: string): PendingSave | null {
	return pending.get(clusterId) ?? null;
}

/** Only the save it was handed: a newer one stays until it is seen through on its own. */
export function forgetSave(clusterId: string, save: PendingSave) {
	if (pending.get(clusterId) === save) {
		pending.delete(clusterId);
		changed();
	}
}

export function forgetAllSavesForTests() {
	pending.clear();
	changed();
}
