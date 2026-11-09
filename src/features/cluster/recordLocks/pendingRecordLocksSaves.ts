export interface PendingSave {
	target: boolean;
	at: number;
}

/**
 * Saves whose roll no page has seen yet, by cluster. Module state rather than component state, so
 * leaving the page during the gap and coming back still reads the gap as the roll starting, instead
 * of offering Try again over a roll that is about to begin.
 */
const pending = new Map<string, PendingSave>();

export function rememberSave(clusterId: string, target: boolean, at = Date.now()) {
	pending.set(clusterId, { target, at });
}

export function pendingSave(clusterId: string): PendingSave | null {
	return pending.get(clusterId) ?? null;
}

/** Only the save it was handed: a newer one stays until it is seen through on its own. */
export function forgetSave(clusterId: string, save: PendingSave) {
	if (pending.get(clusterId) === save) {
		pending.delete(clusterId);
	}
}

export function forgetAllSavesForTests() {
	pending.clear();
}
