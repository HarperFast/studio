import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
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
): Record<string, unknown> {
	return {
		operation: 'read_log',
		start: 0,
		replicated,
		limit: clampReadLogLimit(logFilters.limit),
		level: logFilters.level !== 'undefined' ? logFilters.level : undefined,
		from: logFilters.from ? new Date(logFilters.from).toISOString() : undefined,
		until: logFilters.until ? new Date(logFilters.until).toISOString() : undefined,
		log_name: logFilters.log_name ?? undefined,
		filter: logFilters.filter ? logFilters.filter : undefined,
		order: 'desc',
	};
}

export async function getReadLog(
	{ instanceClient, logFilters, replicated }: Omit<GetReadLogParams, 'isAutoRefreshEnabled'> & InstanceClientIdConfig,
): Promise<ReadLogItem[]> {
	const { data } = await instanceClient.post<ReadLogItem[]>('/', buildReadLogBody(logFilters, replicated));
	return data;
}

export function getReadLogQueryOptions(params: GetReadLogParams & InstanceClientIdConfig) {
	const logFilters = params.logFilters;
	return queryOptions({
		queryKey: [
			params.entityId,
			'read_log',
			logFilters.limit,
			logFilters.level,
			logFilters.from,
			logFilters.until,
			logFilters.log_name,
			logFilters.filter,
			params.replicated,
		] as const,
		queryFn: () => getReadLog(params),
		retry: false,
		refetchInterval: params.isAutoRefreshEnabled ? 5000 : false,
	});
}
