import instanceClient from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

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
	return queryOptions({
		queryKey: [instanceId, 'read_log'] as const,
		queryFn: () => {
			if (logFilters.level === 'undefined') {
				logFilters.level = undefined;
			}

			return instanceClient.post('/', {
				operation: 'read_log',
				start: 0,
				...logFilters,
			}) as unknown;
		},
		enabled: !!instanceId,
		retry: false,
	});
}

export { getReadLogQueryOptions, LogFiltersSchema };
