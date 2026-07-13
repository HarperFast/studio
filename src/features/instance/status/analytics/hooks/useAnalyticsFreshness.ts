import type { EntityIds } from '@/features/auth/store/authStore';
import { ANALYTICS_QUERY_KEY_PREFIX } from '@/integrations/api/instance/status/getAnalytics';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const PREFIX = ANALYTICS_QUERY_KEY_PREFIX;

export interface AnalyticsFreshness {
	/** True while at least one panel-level get_analytics query is fetching. */
	isFetching: boolean;
	/** ms-since-epoch of the most recent successful fetch on any panel
	 *  query, or null until the first one resolves. */
	lastFetchedAt: number | null;
	/** Bumps every second so consumers can re-render relative time
	 *  ("updated Xs ago") without subscribing themselves. */
	now: number;
}

/** Watches the React Query cache for activity on the `get_analytics`
 *  prefix and exposes a busy flag + most-recent-success timestamp. The
 *  TimeRangePicker uses these to show an active/spinning refresh icon
 *  and a "last updated" relative-time label. Scoped to `entityId` (key
 *  position 1, per getAnalytics.ts) so two instance Status pages open
 *  at once don't reflect each other's fetches. */
export function useAnalyticsFreshness(entityId: EntityIds): AnalyticsFreshness {
	const client = useQueryClient();
	const [isFetching, setIsFetching] = useState(false);
	const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const cache = client.getQueryCache();
		const isOurs = (q: { queryKey: unknown }) =>
			Array.isArray(q.queryKey) && q.queryKey[0] === PREFIX && q.queryKey[1] === entityId;
		const sync = () => {
			let fetching = false;
			let mostRecent: number | null = null;
			for (const q of cache.getAll()) {
				if (!isOurs(q)) { continue; }
				if (q.state.fetchStatus === 'fetching') { fetching = true; }
				if (q.state.dataUpdatedAt > 0 && (mostRecent === null || q.state.dataUpdatedAt > mostRecent)) {
					mostRecent = q.state.dataUpdatedAt;
				}
			}
			// Only setState when the value actually changed — RQ fires the
			// subscription on every cache event in the entire app, and a
			// no-op setState would still trigger a re-render of the picker.
			setIsFetching((prev) => (prev === fetching ? prev : fetching));
			setLastFetchedAt((prev) => (prev === mostRecent ? prev : mostRecent));
		};
		sync();
		// Subscribe filter: we only care about events on `get_analytics_raw`
		// queries. Filter the *event* (not just the post-aggregate) so we
		// don't recompute the cache scan for every unrelated query mutation.
		const unsub = cache.subscribe((event) => {
			if (!event?.query || !isOurs(event.query)) { return; }
			sync();
		});
		return () => unsub();
	}, [client, entityId]);

	useEffect(() => {
		// Tick rate adapts to age so we don't burn a 1Hz timer per picker
		// indefinitely. Updates per-second for the first minute (where "Xs"
		// is changing), every 5s for the next 9 minutes, then every 30s.
		let cancelled = false;
		let timerId: number | undefined;
		const tick = () => {
			if (cancelled) { return; }
			setNow(Date.now());
			const age = lastFetchedAt === null ? 0 : Date.now() - lastFetchedAt;
			const delay = age < 60_000 ? 1000 : age < 600_000 ? 5000 : 30_000;
			timerId = window.setTimeout(tick, delay);
		};
		timerId = window.setTimeout(tick, 1000);
		return () => {
			cancelled = true;
			if (timerId !== undefined) { window.clearTimeout(timerId); }
		};
	}, [lastFetchedAt]);

	return { isFetching, lastFetchedAt, now };
}

/** Format `lastFetchedAt` as a short relative-time label suitable for a
 *  toolbar pill: "just now" / "Xs ago" / "Xm ago". Returns null when no
 *  fetch has resolved yet. */
export function formatRelativeUpdate(lastFetchedAt: number | null, now: number): string | null {
	if (lastFetchedAt === null) { return null; }
	const seconds = Math.max(0, Math.floor((now - lastFetchedAt) / 1000));
	if (seconds < 5) { return 'just now'; }
	if (seconds < 60) { return `${seconds}s ago`; }
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) { return `${minutes}m ago`; }
	const hours = Math.floor(minutes / 60);
	return `${hours}h ago`;
}
