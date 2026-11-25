import type { AuthenticatedConnectionKey, EntityIds } from './authStore';

/**
 * Sign-in markers: one `localStorage` key per entity, holding the operations URL it was signed into. Each tab writes
 * only the entity it signs in or out, so it can't erase or restore another tab's (HarperFast/studio#1968).
 */
const signInMarkerPrefix = 'Studio:PotentiallyAuthenticated:';
/** Every marker in one record, as releases before v2.199.0 keep them (DESIGN.md). */
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
		// Unreadable storage reads as signed out.
	}
	return markers;
}

/** Null when the record is absent or is not one; entries that aren't markers are dropped. */
function parseLegacySignInMarkers(raw: string | null): SignIns | null {
	try {
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
 * Copies the legacy record into per-entity keys, a marker already stored winning, then deletes it. Every load does
 * this, since an older tab can write the record back. Returns the markers storage refused to copy, whose record stays.
 */
export function migrateLegacySignInMarkers(): SignIns {
	try {
		localStorage.removeItem(legacyMigratedKey);
	} catch {
		// Harmless where it stays.
	}
	let raw: string | null;
	try {
		raw = localStorage.getItem(legacySignInMarkersKey);
	} catch {
		return {};
	}
	if (raw === null) {
		return {};
	}
	const legacy = parseLegacySignInMarkers(raw) ?? {};
	try {
		for (const [id, url] of Object.entries(legacy)) {
			if (!localStorage.getItem(signInMarkerKey(id))) {
				localStorage.setItem(signInMarkerKey(id), url);
			}
		}
	} catch {
		return legacy;
	}
	try {
		// Takes with it a rewrite another tab made since the read, as storage has no compare-and-delete. That tab writes
		// its whole record again the next time it records a sign-in or sign-out.
		localStorage.removeItem(legacySignInMarkersKey);
	} catch {
		// The next load moves it again.
	}
	return {};
}
