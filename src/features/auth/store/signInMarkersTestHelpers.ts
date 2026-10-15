import { readSignInMarkers, signInMarkerKey } from './signInMarkers';

/** Stores sign-in markers the way a tab of this release records its sign-ins. */
export function seedSignInMarkers(markers: Record<string, string>): void {
	for (const [id, url] of Object.entries(markers)) {
		localStorage.setItem(signInMarkerKey(id), url);
	}
}

export function storedSignInMarkers(): Record<string, string> {
	return Object.fromEntries(readSignInMarkers());
}
