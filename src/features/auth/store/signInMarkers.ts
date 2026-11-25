import type { AuthenticatedConnectionKey, EntityIds } from './authStore';

/**
 * Sign-in markers: one `localStorage` key per entity, holding the operations URL it was signed into. Each tab writes
 * only the entity it signs in or out, so it can't erase or restore another tab's (HarperFast/studio#1968).
 *
 * Releases before v2.199.0 kept every marker in one record. Each load moves what is still in it into these keys and
 * deletes it (DESIGN.md, HarperFast/studio#1970).
 */
const signInMarkerPrefix = 'Studio:PotentiallyAuthenticated:';
export const legacySignInMarkersKey = 'Studio:PotentiallyAuthenticated';
/** Set by the releases that kept the record in step once they had copied it. Nothing reads it now. */
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
 * Copies the legacy record into per-entity keys, leaving any marker already stored per entity as it is, then deletes
 * it and the old migration flag. A tab still open on a release before v2.199.0 writes its whole load-time copy back at
 * each sign-in or sign-out, so the record can return; the next load moves it again, which keeps that tab's sign-ins in
 * reach of a sign-out here (DESIGN.md).
 *
 * Returns the markers storage refused to copy: the record is kept for the next load, and they seed this tab's.
 */
export function migrateLegacySignInMarkers(): SignIns {
	let raw: string | null;
	try {
		localStorage.removeItem(legacyMigratedKey);
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
		localStorage.removeItem(legacySignInMarkersKey);
	} catch {
		// The next load moves it again.
	}
	return {};
}
