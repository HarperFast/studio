/** Paths that already exist at the destination of a create / upload / move. */
export interface OverwriteRequest {
	/** Existing files that would be replaced. */
	files: string[];
	/** Existing directories that would be merged into. */
	directories: string[];
}

type Handler = (request: OverwriteRequest, resolve: (confirmed: boolean) => void) => void;

let handler: Handler | undefined;

/**
 * Registered by the mounted {@link OverwriteConfirmModal}. Kept out of the React tree so any
 * async flow (upload loop, rename, create) can `await confirmOverwrite(...)` imperatively.
 */
export function registerOverwriteConfirmHandler(next: Handler | undefined): void {
	handler = next;
}

/**
 * Ask the user to confirm overwriting files / merging directories. Resolves `true` to
 * proceed, `false` to skip. If no modal is mounted (shouldn't happen in the editor), it
 * fails safe by resolving `false` so nothing is silently overwritten.
 */
export function confirmOverwrite(request: OverwriteRequest): Promise<boolean> {
	const hasCollisions = request.files.length > 0 || request.directories.length > 0;
	if (!hasCollisions) {
		return Promise.resolve(true); // nothing to confirm — proceed.
	}
	if (!handler) {
		return Promise.resolve(false); // no modal mounted — fail safe, don't overwrite.
	}
	return new Promise<boolean>(resolve => handler!(request, resolve));
}
