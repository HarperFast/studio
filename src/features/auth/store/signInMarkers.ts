import type { AuthenticatedConnectionKey, EntityIds } from './authStore';

/**
 * Sign-in markers: one `localStorage` key per entity, holding the operations URL it was signed into. Each tab writes
 * only the entity it signs in or out, so it can't erase or restore another tab's (HarperFast/studio#1968).
 *
 * The previous release kept every marker in one record, which its tabs still read once at load and write back whole.
 * While those tabs can still be open, or a rollback can bring that release back, this one mirrors each change into the
 * record too and reads it in sign-out sweeps (DESIGN.md).
 */
export const signInMarkerPrefix = 'Studio:PotentiallyAuthenticated:';
export const legacySignInMarkersKey = 'Studio:PotentiallyAuthenticated';
const legacyMigratedKey = 'Studio:PotentiallyAuthenticatedMigrated';

type SignIns = Record<EntityIds, AuthenticatedConnectionKey>;

export function signInMarkerKey(id: EntityIds): string {
	return signInMarkerPrefix + id;
}

/** Raw, since other tabs write them too. */
export function readSignInMarkers(): Array<[EntityIds, AuthenticatedConnectionKey]> {
	const markers: Array<[EntityIds, AuthenticatedConnectionKey]> = [];
	try {
		for (let index = 0; index < localStorage.length; index++) {
			const key = localStorage.key(index);
			const url = key?.startsWith(signInMarkerPrefix) ? localStorage.getItem(key) : null;
			if (key && url) {
				markers.push([key.slice(signInMarkerPrefix.length), url]);
			}
		}
	} catch {
		// Storage that can't be read holds no marker this tab could use.
	}
	return markers;
}

/** Null when the record is absent, or is not one. */
export function readLegacySignInMarkers(): SignIns | null {
	try {
		const raw = localStorage.getItem(legacySignInMarkersKey);
		const markers: unknown = raw ? JSON.parse(raw) : null;
		if (!markers || typeof markers !== 'object' || Array.isArray(markers)) {
			return null;
		}
		return Object.fromEntries(
			Object.entries(markers).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1]),
		);
	} catch {
		return null;
	}
}

/**
 * Copies the legacy record into per-entity keys once per storage, leaving any marker already stored per entity as it
 * is. Later loads don't read it again: the previous release's tabs write their whole load-time copy back into it, so
 * it would bring back what this release signed out. Two tabs migrating at once write the same values.
 *
 * A record that is not one is removed on every load: the previous release fails to start on it.
 */
export function migrateLegacySignInMarkers(): void {
	try {
		const legacy = readLegacySignInMarkers();
		if (!legacy && localStorage.getItem(legacySignInMarkersKey) !== null) {
			localStorage.removeItem(legacySignInMarkersKey);
		}
		if (localStorage.getItem(legacyMigratedKey)) {
			return;
		}
		for (const [id, url] of Object.entries(legacy ?? {})) {
			if (!localStorage.getItem(signInMarkerKey(id))) {
				localStorage.setItem(signInMarkerKey(id), url);
			}
		}
		localStorage.setItem(legacyMigratedKey, '1');
	} catch {
		// The next load tries again.
	}
}

/**
 * Keeps the legacy record current for the previous release's tabs. Best effort: one that misses a sign-in only shows
 * it signed out. A removal it can't write takes the whole record, as that release does itself, since a marker it kept
 * would make its next load probe the entity with its cookies. `removing` limits a removal to the URL a failed check
 * used.
 */
export function mirrorLegacySignInMarker(
	id: EntityIds,
	url: AuthenticatedConnectionKey | null,
	removing?: AuthenticatedConnectionKey,
): void {
	try {
		const markers = readLegacySignInMarkers() ?? {};
		const unchanged = url === null
			? !Object.hasOwn(markers, id) || (removing !== undefined && markers[id] !== removing)
			: markers[id] === url;
		if (unchanged) {
			return;
		}
		if (url === null) {
			delete markers[id];
		} else {
			markers[id] = url;
		}
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify(markers));
	} catch {
		if (url === null) {
			try {
				localStorage.removeItem(legacySignInMarkersKey);
			} catch {
				// Nothing left to try.
			}
		}
	}
}
