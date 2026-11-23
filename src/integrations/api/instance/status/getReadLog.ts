import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { anySignal } from '@/lib/abortSignals';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

export interface ReadLogItem {
	level: 'notify' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'stderr' | 'stdout';
	timestamp: string;
	thread: string;
	tags: string[];
	node: string;
	message: string;
}

interface GetReadLogParams {
	logFilters: z.infer<typeof LogFiltersFormSchema>;
	replicated: boolean;
	isAutoRefreshEnabled: boolean;
	contextTimestamp?: string;
	order?: 'asc' | 'desc';
	start?: number;
	signal?: AbortSignal;
}

/**
 * Client-side ceiling on the `limit` we put on the wire, regardless of what the user types.
 * The backend's SSE tail has an O(n·limit) cost for large limits (see harper#1693), so this
 * keeps an unbounded number off the wire independent of whatever the backend eventually clamps.
 */
export const MAX_READ_LOG_LIMIT = 10000;

/** Parse the user-supplied `limit` string, clamped to {@link MAX_READ_LOG_LIMIT}; undefined if blank/invalid. */
export function clampReadLogLimit(limit: string | null | undefined): number | undefined {
	if (!limit) {
		return undefined;
	}
	const parsed = parseInt(limit, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return undefined;
	}
	return Math.min(parsed, MAX_READ_LOG_LIMIT);
}

/**
 * Build the `read_log` body. SSE sends relative bounds to the tail; buffered relative reads
 * omit those bounds to preserve Harper’s tail seek and apply the cutoff in useInstanceLogs.
 */
export function buildReadLogBody(
	logFilters: z.infer<typeof LogFiltersFormSchema>,
	replicated: boolean,
	order: 'asc' | 'desc' = 'desc',
	start = 0,
): Record<string, unknown> {
	return {
		operation: 'read_log',
		start,
		replicated,
		limit: clampReadLogLimit(logFilters.limit),
		level: logFilters.level !== 'undefined' ? logFilters.level : undefined,
		from: logFilters.relative_minutes
			? new Date(Date.now() - Number(logFilters.relative_minutes) * 60000).toISOString()
			: logFilters.from
			? new Date(logFilters.from).toISOString()
			: undefined,
		until: !logFilters.relative_minutes && logFilters.until ? new Date(logFilters.until).toISOString() : undefined,
		log_name: logFilters.log_name ?? undefined,
		filter: logFilters.filter ? logFilters.filter : undefined,
		order,
	};
}

export async function getReadLog(
	{ instanceClient, logFilters, replicated, order, start, signal }:
		& Omit<GetReadLogParams, 'isAutoRefreshEnabled'>
		& InstanceClientIdConfig,
): Promise<ReadLogItem[]> {
	const body = buildReadLogBody(logFilters, replicated, order, start);
	if (logFilters.relative_minutes) { delete body.from; }
	signal?.throwIfAborted();
	const { data } = await instanceClient.post<ReadLogItem[]>('/', body, signal ? { signal } : undefined);
	return data;
}

export class LogContextLimitError extends Error {
	constructor() {
		super('Too many logs in this context window. Use Filters to choose a smaller time range.');
		this.name = 'LogContextLimitError';
	}
}

async function getContextLogs(
	params: GetReadLogParams & InstanceClientIdConfig,
	timestamp: string,
): Promise<ReadLogItem[]> {
	const controller = new AbortController();
	const { signal, cleanup } = anySignal([params.signal, controller.signal]);
	const request = { ...params, signal };
	const time = Date.parse(timestamp);
	const limit = clampReadLogLimit(params.logFilters.limit) ?? 1000;
	const beforeLimit = Math.ceil(limit / 2);
	const afterLimit = Math.floor(limit / 2);
	const common = { ...params.logFilters, relative_minutes: undefined };
	const before = async () => {
		let nearest: ReadLogItem[] = [];
		// Harper bounds a forward scan before sorting. Walk bounded pages to reach the center.
		for (let page = 0; page < 8; page++) {
			signal.throwIfAborted();
			const rows = await getReadLog({
				...request,
				order: 'asc',
				start: page * beforeLimit,
				logFilters: {
					...common,
					limit: String(beforeLimit),
					from: new Date(time - 30000).toISOString(),
					until: timestamp,
				},
			});
			nearest = nearest.concat(rows).sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')).slice(
				0,
				beforeLimit,
			);
			if (rows.length < beforeLimit) { return nearest; }
		}
		throw new LogContextLimitError();
	};
	try {
		const [earlier, later] = await Promise.all([
			before(),
			afterLimit
				? getReadLog({
					...request,
					order: 'asc',
					logFilters: {
						...common,
						limit: String(afterLimit),
						from: new Date(time + 1).toISOString(),
						until: new Date(time + 30000).toISOString(),
					},
				})
				: Promise.resolve([]),
		]);
		return earlier.concat(
			later.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')).slice(0, afterLimit),
		);
	} catch (error) {
		controller.abort();
		throw error;
	} finally {
		cleanup();
	}
}

export function getReadLogQueryOptions(params: GetReadLogParams & InstanceClientIdConfig) {
	const logFilters = params.logFilters;
	return queryOptions({
		queryKey: [
			'read_log',
			params.contextTimestamp,
			params.order,
			params.start,
			params.entityId,
			logFilters.relative_minutes,
			logFilters.limit,
			logFilters.level,
			logFilters.from,
			logFilters.until,
			logFilters.log_name,
			logFilters.filter,
			params.replicated,
		] as const,
		queryFn: (context?: { signal?: AbortSignal }) => {
			const request = { ...params, signal: context?.signal ?? params.signal };
			return params.contextTimestamp ? getContextLogs(request, params.contextTimestamp) : getReadLog(request);
		},
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchInterval: params.isAutoRefreshEnabled && !params.contextTimestamp ? pollUnlessForbidden(5_000) : false,
	});
}
