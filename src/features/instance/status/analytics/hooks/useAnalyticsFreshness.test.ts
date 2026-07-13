/** @vitest-environment jsdom */
import type { EntityIds } from '@/features/auth/store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { formatRelativeUpdate, useAnalyticsFreshness } from './useAnalyticsFreshness';

/** Panel-shaped key per getAnalytics.ts: [prefix, entityId, metric, start, end, bucket, conditions]. */
const analyticsKey = (entityId: string) => ['get_analytics_raw', entityId, 'cpu-usage', 0, 60_000, null, null];

function makeWrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe('useAnalyticsFreshness — instance scoping', () => {
	afterEach(cleanup);

	it("ignores another instance's fetch events and timestamps (two Status pages open)", async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		// inst-B is mid-fetch when the inst-A hook mounts.
		let resolveB!: (rows: unknown[]) => void;
		void client.prefetchQuery({
			queryKey: analyticsKey('inst-B'),
			queryFn: () => new Promise<unknown[]>((resolve) => (resolveB = resolve)),
		});
		const { result } = renderHook(
			() => useAnalyticsFreshness('inst-A' as EntityIds),
			{ wrapper: makeWrapper(client) },
		);

		// B's in-flight fetch must not spin A's refresh icon.
		expect(result.current.isFetching).toBe(false);

		act(() => resolveB([]));
		await waitFor(() => expect(client.getQueryState(analyticsKey('inst-B'))?.status).toBe('success'));
		// B's success timestamp must not populate A's "Updated Xs ago" pill.
		expect(result.current.lastFetchedAt).toBeNull();
		expect(result.current.isFetching).toBe(false);

		// A's own fetch IS reflected: busy while in flight, timestamped on success.
		let resolveA!: (rows: unknown[]) => void;
		let fetchA: Promise<unknown> | undefined;
		act(() => {
			fetchA = client.fetchQuery({
				queryKey: analyticsKey('inst-A'),
				queryFn: () => new Promise<unknown[]>((resolve) => (resolveA = resolve)),
			});
		});
		await waitFor(() => expect(result.current.isFetching).toBe(true));
		await act(async () => {
			resolveA([]);
			await fetchA;
		});
		await waitFor(() => expect(result.current.isFetching).toBe(false));
		expect(result.current.lastFetchedAt).toBe(client.getQueryState(analyticsKey('inst-A'))!.dataUpdatedAt);
	});
});

describe('formatRelativeUpdate', () => {
	const now = 1_700_000_000_000;

	it('returns null when no fetch has resolved yet', () => {
		expect(formatRelativeUpdate(null, now)).toBeNull();
	});

	it('reads "just now" within the first 5 seconds', () => {
		expect(formatRelativeUpdate(now, now)).toBe('just now');
		expect(formatRelativeUpdate(now - 4_000, now)).toBe('just now');
	});

	it('reads "Xs ago" between 5 and 59 seconds', () => {
		expect(formatRelativeUpdate(now - 5_000, now)).toBe('5s ago');
		expect(formatRelativeUpdate(now - 30_000, now)).toBe('30s ago');
		expect(formatRelativeUpdate(now - 59_000, now)).toBe('59s ago');
	});

	it('reads "Xm ago" between 1 and 59 minutes', () => {
		expect(formatRelativeUpdate(now - 60_000, now)).toBe('1m ago');
		expect(formatRelativeUpdate(now - 30 * 60_000, now)).toBe('30m ago');
		expect(formatRelativeUpdate(now - 59 * 60_000, now)).toBe('59m ago');
	});

	it('reads "Xh ago" past 60 minutes', () => {
		expect(formatRelativeUpdate(now - 60 * 60_000, now)).toBe('1h ago');
		expect(formatRelativeUpdate(now - 5 * 60 * 60_000, now)).toBe('5h ago');
	});

	it('clamps negative skew (lastFetchedAt > now) to "just now"', () => {
		// Clock skew or a stale `now` shouldn't render "−5s ago".
		expect(formatRelativeUpdate(now + 1_000, now)).toBe('just now');
	});
});
