import { z } from 'zod';

export const LogFiltersFormSchema = z.object({
	limit: z.string().optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).optional(),
	from: z.string().or(z.undefined()).optional(),
	until: z.string().or(z.undefined()).optional(),
});
