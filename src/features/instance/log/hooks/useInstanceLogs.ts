import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { clampReadLogLimit, getReadLogQueryOptions, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { streamReadLog } from '@/integrations/api/instance/status/streamReadLog';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { z } from 'zod';
import { mergeReadLogs } from './mergeReadLogs';
import { INITIAL_STREAM_STATE, streamReducer } from './streamReducer';
import { useSupportsLogSSE } from './useSupportsLogSSE';

type LogFilters = z.infer<typeof LogFiltersFormSchema>;

/** How the logs are currently sourced, for UI messaging. */
export type LogTransport = 'idle' | 'streaming' | 'polling';

export interface UseInstanceLogsParams {
	params: InstanceClientIdConfig & InstanceTypeConfig;
	logFilters: LogFilters;
	replicated: boolean;
	/** The "Live" toggle. Off → one fetch + manual refresh; on → SSE tail, else 5s polling. */
	live: boolean;
}

export interface UseInstanceLogsResult {
	logs: ReadLogItem[];
	isLoading: boolean;
	isFetching: boolean;
	refetch: () => Promise<unknown>;
	/** `'streaming'` over SSE, `'polling'` on the 5s fallback, `'idle'` when not live. */
	transport: LogTransport;
}

/** Fall back to Harper's own `read_log` default when the user clears the limit field. */
const DEFAULT_LIMIT = 1000;
/**
 * Floor on retained live entries so a long-running tail can't grow state unbounded. The actual
 * cap is `max(this, limit)` so a user asking for more than this still sees a contiguous tail
 * (a smaller cap would silently drop the oldest live entries with no backfill while streaming).
 */
const MAX_LIVE_ENTRIES = 2000;
/** Batch streamed entries into at most one render per this interval (a chatty tail safety net). */
const FLUSH_INTERVAL_MS = 250;

function parseLimit(limit: LogFilters['limit']): number {
	return clampReadLogLimit(limit) ?? DEFAULT_LIMIT;
}

/** Stable identity for the filter set, so effects restart only when the requested slice changes. */
function filtersKey(logFilters: LogFilters, replicated: boolean): string {
	return JSON.stringify([
		logFilters.limit,
		logFilters.level,
		logFilters.from,
		logFilters.until,
		logFilters.log_name,
		logFilters.filter,
		replicated,
	]);
}

/**
 * Single source of truth for the logs view: subscribes to `read_log` over SSE when the
 * connection supports it, and transparently falls back to the existing 5s polling otherwise
 * (proxy connection, an instance that doesn't stream, or a stream that errors/ends).
 *
 * The buffered React Query snapshot is always present — it provides the initial backlog and
 * becomes the polling source on fallback — and live entries are merged on top of it, so the
 * table never flickers when the transport switches.
 */
export function useInstanceLogs(
	{ params, logFilters, replicated, live }: UseInstanceLogsParams,
): UseInstanceLogsResult {
	const supportsSSE = useSupportsLogSSE();
	const [stream, dispatch] = useReducer(streamReducer, INITIAL_STREAM_STATE);

	const useSSE = live && supportsSSE && !stream.fellBack;
	const key = filtersKey(logFilters, replicated);
	const limit = parseLimit(logFilters.limit);
	// Retain at least `limit` live entries so a user asking for a large slice still sees a
	// contiguous tail rather than the oldest streamed lines silently dropping (polling is off
	// while streaming, so there is no backfill to close such a gap).
	const retainCap = Math.max(MAX_LIVE_ENTRIES, limit);

	const query = useQuery(
		getReadLogQueryOptions({
			...params,
			logFilters,
			replicated,
			// Poll only when live and NOT streaming: the SSE tail carries live updates itself.
			isAutoRefreshEnabled: live && !useSSE,
		}),
	);

	// A new entity or filter set is a new subscription context — drop stale live entries and any
	// fall-back. Deliberately NOT keyed on `live`: toggling Live off must keep the streamed tail
	// on screen (otherwise the table jumps back to the pre-Live snapshot with no signal).
	useEffect(() => {
		dispatch({ kind: 'reset' });
	}, [params.entityId, key]);

	// Turning Live back on after a fall-back should re-attempt SSE — but without discarding the
	// entries already on screen, so only the fall-back flag is cleared.
	useEffect(() => {
		if (live) {
			dispatch({ kind: 'retry' });
		}
	}, [live]);

	// Keep the latest filters/replicated in refs so the tail can send the current slice without
	// tearing the stream down on every keystroke — it restarts only when `key` changes below.
	const streamArgsRef = useRef({ logFilters, replicated });
	streamArgsRef.current = { logFilters, replicated };

	useEffect(() => {
		if (!useSSE) {
			return;
		}
		const controller = new AbortController();
		let pending: ReadLogItem[] = [];
		const flush = () => {
			if (pending.length > 0 && !controller.signal.aborted) {
				const batch = pending;
				pending = [];
				dispatch({ kind: 'append', entries: batch, cap: retainCap });
			}
		};
		const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

		streamReadLog({
			connection: { id: params.entityId },
			logFilters: streamArgsRef.current.logFilters,
			replicated: streamArgsRef.current.replicated,
			signal: controller.signal,
			onEntry: (entry) => pending.push(entry),
		})
			.catch(() => {
				// SSEUnsupported / SSEOperation / transport errors all mean: stop trusting SSE for
				// this slice and let the query poll. A caller-driven abort is filtered out below.
			})
			.finally(() => {
				clearInterval(flushTimer);
				if (controller.signal.aborted) {
					return;
				}
				flush();
				// The tail is over (clean end or error). Poll to keep catching new entries.
				dispatch({ kind: 'fellBack' });
			});

		return () => {
			clearInterval(flushTimer);
			controller.abort();
		};
	}, [useSSE, params.entityId, key]);

	const logs = useMemo(() => {
		const snapshot = query.data ?? [];
		// Merge whenever there are streamed entries — including after Live is toggled off — so the
		// tail the user was watching stays on screen instead of snapping back to the older snapshot.
		return stream.entries.length === 0 ? snapshot : mergeReadLogs(snapshot, stream.entries, limit);
	}, [query.data, stream.entries, limit]);

	const transport: LogTransport = useSSE ? 'streaming' : live ? 'polling' : 'idle';

	return {
		logs,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		refetch: () => query.refetch(),
		transport,
	};
}
