import type { AuthenticatedConnectionKey, EntityIds } from './authStore';

/**
 * Sign-in markers: one `localStorage` key per entity, holding the operations URL it was signed into. Each tab writes
 * only the entity it signs in or out, so it can't erase or restore another tab's (HarperFast/studio#1968).
 *
 * The previous release kept every marker in one record, which its tabs still read once at load and write back whole.
 * While those tabs can still be open, or a rollback can bring that release back, this one mirrors each change into the
 * record too and reads it in sign-out sweeps (DESIGN.md).
 */
const signInMarkerPrefix = 'Studio:PotentiallyAuthenticated:';
export const legacySignInMarkersKey = 'Studio:PotentiallyAuthenticated';
/** Survives the sign-out wipe: a previous-release tab writing its copy back afterwards must not be migrated again. */
export const legacyMigratedKey = 'Studio:PotentiallyAuthenticatedMigrated';

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

export function readLegacySignInMarkers(): SignIns | null {
	try {
		return parseLegacySignInMarkers(localStorage.getItem(legacySignInMarkersKey));
	} catch {
		return null;
	}
}

/**
 * Copies the legacy record into per-entity keys once per storage, leaving any marker already stored per entity as it
 * is. Later loads don't read it again: the previous release's tabs write their whole load-time copy back into it, so
 * it would bring back what this release signed out. Two tabs migrating at once write the same values. Returns whether
 * the record has been migrated, now or before.
 *
 * Every load also cleans the record, since the previous release fails to start on one that isn't a record: it is
 * removed, and entries that aren't markers are dropped from one that is.
 */
export function migrateLegacySignInMarkers(): boolean {
	let migrated = false;
	let raw: string | null = null;
	try {
		migrated = !!localStorage.getItem(legacyMigratedKey);
		raw = localStorage.getItem(legacySignInMarkersKey);
	} catch {
		// Reported as migrated: the record could be a previous-release write-back, which must not seed this load.
		return true;
	}
	const legacy = parseLegacySignInMarkers(raw);
	try {
		if (raw !== null && !legacy) {
			localStorage.removeItem(legacySignInMarkersKey);
		} else if (legacy && JSON.stringify(legacy) !== raw) {
			localStorage.setItem(legacySignInMarkersKey, JSON.stringify(legacy));
		}
	} catch {
		// Cleaned at the next load instead.
	}
	if (migrated) {
		return true;
	}
	try {
		for (const [id, url] of Object.entries(legacy ?? {})) {
			if (!localStorage.getItem(signInMarkerKey(id))) {
				localStorage.setItem(signInMarkerKey(id), url);
			}
		}
		localStorage.setItem(legacyMigratedKey, '1');
		return true;
	} catch {
		return false;
	}
}

/** After the sign-out wipe nothing of the legacy record is left, so a write-back after it is never migrated. */
export function markLegacySignInMarkersMigrated(): void {
	try {
		localStorage.setItem(legacyMigratedKey, '1');
	} catch {
		// The wipe kept the flag if it was already set.
	}
}

/**
 * Keeps the legacy record current for the previous release's tabs. Best effort: one that misses a sign-in only shows
 * it signed out. A removal it can't write takes the whole record, as that release does itself, since a marker it kept
 * would make its next load probe the entity with its cookies. A sign-in leaves a record it can't read alone, rather
 * than replace other tabs' markers with this one. `removing` limits a removal to the URL a failed check used, and a
 * failed check, being a probe rather than a sign-out, never takes the whole record.
 */
export function mirrorLegacySignInMarker(
	id: EntityIds,
	url: AuthenticatedConnectionKey | null,
	removing?: AuthenticatedConnectionKey,
): void {
	try {
		const raw = localStorage.getItem(legacySignInMarkersKey);
		const markers = raw === null ? {} : parseLegacySignInMarkers(raw);
		if (!markers) {
			throw new Error('The legacy sign-in record is not one');
		}
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
		if (url === null && removing === undefined) {
			try {
				localStorage.removeItem(legacySignInMarkersKey);
			} catch {
				// Storage that refuses this too keeps the record, as the previous release's own fallback would.
			}
		}
	}
}
