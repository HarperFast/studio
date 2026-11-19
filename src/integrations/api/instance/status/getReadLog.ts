import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
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
 * Build the `read_log` operation body from the current filters. Shared by the buffered
 * (axios) fetch and the SSE tail so the two paths request the exact same slice — the only
 * difference between them is the `Accept` header (see `streamReadLog`).
 */
export function buildReadLogBody(
	logFilters: z.infer<typeof LogFiltersFormSchema>,
	replicated: boolean,
	order: 'asc' | 'desc' = 'desc',
): Record<string, unknown> {
	return {
		operation: 'read_log',
		start: 0,
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
	{ instanceClient, logFilters, replicated, order }:
		& Omit<GetReadLogParams, 'isAutoRefreshEnabled'>
		& InstanceClientIdConfig,
): Promise<ReadLogItem[]> {
	const { data } = await instanceClient.post<ReadLogItem[]>('/', buildReadLogBody(logFilters, replicated, order));
	return data;
}

async function getContextLogs(
	params: GetReadLogParams & InstanceClientIdConfig,
	timestamp: string,
): Promise<ReadLogItem[]> {
	const time = Date.parse(timestamp);
	const limit = clampReadLogLimit(params.logFilters.limit) ?? 1000;
	const beforeLimit = Math.ceil(limit / 2);
	const afterLimit = Math.floor(limit / 2);
	const common = { ...params.logFilters, relative_minutes: undefined };
	const [before, after] = await Promise.all([
		getReadLog({
			...params,
			order: 'desc',
			logFilters: {
				...common,
				limit: String(beforeLimit),
				from: new Date(time - 30000).toISOString(),
				until: timestamp,
			},
		}),
		afterLimit
			? getReadLog({
				...params,
				order: 'asc',
				logFilters: {
					...common,
					limit: String(afterLimit),
					from: timestamp,
					until: new Date(time + 30000).toISOString(),
				},
			})
			: Promise.resolve([]),
	]);
	return before.slice(0, beforeLimit).concat(after.slice(0, afterLimit));
}

export function getReadLogQueryOptions(params: GetReadLogParams & InstanceClientIdConfig) {
	const logFilters = params.logFilters;
	return queryOptions({
		queryKey: [
			'read_log',
			params.contextTimestamp,
			params.order,
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
		queryFn: () => params.contextTimestamp ? getContextLogs(params, params.contextTimestamp) : getReadLog(params),
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchInterval: params.isAutoRefreshEnabled && !params.contextTimestamp ? pollUnlessForbidden(5_000) : false,
	});
}
