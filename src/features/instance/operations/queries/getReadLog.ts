import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LogFiltersFormSchema } from '@/features/instance/operations/schemas/logFiltersFormSchema';
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

export function getReadLogQueryOptions({
	entityId,
	instanceClient,
	logFilters,
	replicated,
	isAutoRefreshEnabled,
}: GetReadLogParams & InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [
			entityId,
			'read_log',
			logFilters.limit,
			logFilters.level,
			logFilters.from,
			logFilters.until,
			replicated,
		] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'read_log',
				start: 0,
				replicated,
				limit: logFilters.limit ? parseInt(logFilters.limit, 10) : undefined,
				level: logFilters.level !== 'undefined' ? logFilters.level : undefined,
				from: logFilters.from ? new Date(logFilters.from).toISOString() : undefined,
				until: logFilters.until ? new Date(logFilters.until).toISOString() : undefined,
				order: 'desc',
			});
			return data as ReadLogItem[];
		},
		retry: false,
		refetchInterval: isAutoRefreshEnabled ? 5000 : false,
	});
}
