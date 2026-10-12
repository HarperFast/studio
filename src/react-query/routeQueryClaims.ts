import type { Query } from '@tanstack/react-query';

/** `Query` itself rejects most concretely typed queries; identity is all a claim needs. */
type AnyQuery = Pick<Query, 'queryHash'>;

const routeClaims = new WeakMap<AnyQuery, number>();

/** Until the returned release runs or `signal` aborts, a failure of `query` is the route's to show and report. */
export function claimForRoute(query: AnyQuery, signal: AbortSignal): () => void {
	if (signal.aborted) {
		return () => undefined;
	}
	routeClaims.set(query, (routeClaims.get(query) ?? 0) + 1);
	let released = false;
	const release = () => {
		if (released) {
			return;
		}
		released = true;
		signal.removeEventListener('abort', release);
		const remaining = (routeClaims.get(query) ?? 1) - 1;
		if (remaining > 0) {
			routeClaims.set(query, remaining);
		} else {
			routeClaims.delete(query);
		}
	};
	signal.addEventListener('abort', release);
	return release;
}

export function isClaimedByRoute(query: AnyQuery): boolean {
	return routeClaims.has(query);
}
