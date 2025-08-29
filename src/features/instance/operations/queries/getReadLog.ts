import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

export interface ReadLogItem {
	level: 'notify' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'stderr' | 'stdout';
	timestamp: string;
	thread: string;
	tags: string[];
	message: string;
}

export const LogFiltersFormSchema = z.object({
	limit: z.string().optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).optional(),
	from: z.string().or(z.undefined()).optional(),
	until: z.string().or(z.undefined()).optional(),
	order: z.enum(['asc', 'desc']).optional(),
});

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
	if (logFilters.level === 'undefined') {
		logFilters.level = undefined;
	}
	return queryOptions({
		queryKey: [entityId, 'read_log', logFilters.limit, logFilters.level, logFilters.from, logFilters.until, logFilters.order, replicated, isAutoRefreshEnabled] as const,
		queryFn: async () => {
			const formattedLogFilters = {
				...logFilters,
				limit: logFilters.limit ? parseInt(logFilters.limit, 10) : undefined,
				from: logFilters.from ? new Date(logFilters.from).toISOString() : undefined,
				until: logFilters.until ? new Date(logFilters.until).toISOString() : undefined,
			};
			const { data } = await instanceClient.post('/', {
				operation: 'read_log',
				start: 0,
				replicated,
				...formattedLogFilters,
			});
			return data as ReadLogItem[];
		},
		retry: false,
		refetchInterval: isAutoRefreshEnabled ? 5000 : false,
	});
}
