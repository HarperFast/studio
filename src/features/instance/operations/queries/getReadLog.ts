import { instanceClient } from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

type ReadLogItem = {
	level: 'notify' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'stderr' | 'stdout';
	timestamp: string;
	thread: string;
	tags: string[];
	message: string;
};

const LogFiltersSchema = z.object({
	limit: z.coerce.number().optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).optional(),
	from: z.date().or(z.undefined()).optional(),
	until: z.date().or(z.undefined()).optional(),
	order: z.enum(['asc', 'desc']).optional(),
});
function getReadLogQueryOptions({
	instanceId,
	logFilters,
}: {
	instanceId: string;
	logFilters: z.infer<typeof LogFiltersSchema>;
}) {
	if (logFilters.level === 'undefined') {
		logFilters.level = undefined;
	}
	return queryOptions({
		queryKey: [instanceId, 'read_log', logFilters.limit, logFilters.level, logFilters.from, logFilters.until, logFilters.order] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post('/', {
				operation: 'read_log',
				start: 0,
				replicated: true,
				...logFilters,
			});
			return data as ReadLogItem[];
		},
		enabled: !!instanceId,
		retry: false,
	});
}

export { getReadLogQueryOptions, LogFiltersSchema };
export type { ReadLogItem };
