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

export async function getReadLog(
	{ instanceClient, logFilters, replicated }: Omit<GetReadLogParams, 'isAutoRefreshEnabled'> & InstanceClientIdConfig,
): Promise<ReadLogItem[]> {
	const { data } = await instanceClient.post<ReadLogItem[]>('/', {
		operation: 'read_log',
		start: 0,
		replicated,
		limit: logFilters.limit ? parseInt(logFilters.limit, 10) : undefined,
		level: logFilters.level !== 'undefined' ? logFilters.level : undefined,
		from: logFilters.from ? new Date(logFilters.from).toISOString() : undefined,
		until: logFilters.until ? new Date(logFilters.until).toISOString() : undefined,
		log_name: logFilters.log_name ?? undefined,
		order: 'desc',
	});
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
			params.replicated,
		] as const,
		queryFn: () => getReadLog(params),
		retry: false,
		refetchInterval: params.isAutoRefreshEnabled ? 5000 : false,
	});
}
