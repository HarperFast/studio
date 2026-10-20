import { readSignInMarkers, signInMarkerKey } from './signInMarkers';

export function seedSignInMarkers(markers: Record<string, string>): void {
	for (const [id, url] of Object.entries(markers)) {
		localStorage.setItem(signInMarkerKey(id), url);
	}
}

export function storedSignInMarkers(): Record<string, string> {
	return Object.fromEntries(readSignInMarkers());
}
