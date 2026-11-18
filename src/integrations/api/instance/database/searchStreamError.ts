/**
 * Harper failing a search after its results began to stream. The response is already a 200 by then, so
 * Harper ends the array with `{ error }` instead (harper `server/serverHelpers/JSONStream.ts`, v5.3.6):
 * the hits before it are a partial answer, and the failure is Harper's own words.
 */
export class SearchStreamError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SearchStreamError';
	}
}

/** The caller's select always yields hits with more than one key, so a lone `error` key is Harper's. */
export function throwIfStreamFailed(hits: unknown[]): void {
	const last = hits.at(-1);
	if (!last || typeof last !== 'object' || Object.keys(last).length !== 1) {
		return;
	}
	const { error } = last as { error?: unknown };
	if (typeof error === 'string') {
		throw new SearchStreamError(error);
	}
}
