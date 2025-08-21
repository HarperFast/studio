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

export const LogFiltersSchema = z.object({
	limit: z.coerce.number().optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).optional(),
	from: z.date().or(z.undefined()).optional(),
	until: z.date().or(z.undefined()).optional(),
	order: z.enum(['asc', 'desc']).optional(),
});

interface GetReadLogParams {
	logFilters: z.infer<typeof LogFiltersSchema>;
}

export function getReadLogQueryOptions({
	entityId,
	instanceClient,
	logFilters,
}: GetReadLogParams & InstanceClientIdConfig) {
	if (logFilters.level === 'undefined') {
		logFilters.level = undefined;
	}
	return queryOptions({
		queryKey: [entityId, 'read_log', logFilters.limit, logFilters.level, logFilters.from, logFilters.until, logFilters.order] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'read_log',
				start: 0,
				replicated: true,
				...logFilters,
			});
			return data as ReadLogItem[];
		},
		retry: false,
	});
}
