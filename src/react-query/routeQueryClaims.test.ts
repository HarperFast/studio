import { describe, expect, it } from 'vitest';
import { claimForRoute, isClaimedByRoute } from './routeQueryClaims';

const aQuery = () => ({ queryHash: '["k"]' });

describe('claimForRoute', () => {
	it('claims the query until released', () => {
		const query = aQuery();
		const release = claimForRoute(query, new AbortController().signal);

		expect(isClaimedByRoute(query)).toBe(true);
		release();
		expect(isClaimedByRoute(query)).toBe(false);
	});

	it('tells queries apart by identity, not by key', () => {
		const query = aQuery();
		claimForRoute(query, new AbortController().signal);

		expect(isClaimedByRoute(aQuery())).toBe(false);
	});

	it('keeps the claim while any of several overlapping loads still awaits the query', () => {
		const query = aQuery();
		const releaseFirst = claimForRoute(query, new AbortController().signal);
		const releaseSecond = claimForRoute(query, new AbortController().signal);

		releaseFirst();
		expect(isClaimedByRoute(query)).toBe(true);
		releaseSecond();
		expect(isClaimedByRoute(query)).toBe(false);
	});

	it('releases on abort, and a later release or abort does not take another load’s claim with it', () => {
		const query = aQuery();
		const abandoned = new AbortController();
		const releaseAbandoned = claimForRoute(query, abandoned.signal);
		const releaseLive = claimForRoute(query, new AbortController().signal);

		abandoned.abort();
		releaseAbandoned();
		releaseAbandoned();
		expect(isClaimedByRoute(query)).toBe(true);

		releaseLive();
		expect(isClaimedByRoute(query)).toBe(false);
	});

	it('ignores an abort that arrives after the load settled', () => {
		const query = aQuery();
		const settled = new AbortController();
		claimForRoute(query, settled.signal)();
		const releaseLive = claimForRoute(query, new AbortController().signal);

		settled.abort();

		expect(isClaimedByRoute(query)).toBe(true);
		releaseLive();
	});

	it('does not claim for a load the router already abandoned', () => {
		const query = aQuery();
		const abandoned = new AbortController();
		abandoned.abort();

		claimForRoute(query, abandoned.signal)();

		expect(isClaimedByRoute(query)).toBe(false);
	});
});
