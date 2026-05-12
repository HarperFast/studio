import { z } from 'zod';

export const LogFiltersFormSchema = z.object({
	limit: z.string().or(z.undefined()).or(z.null()).optional(),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).or(z.undefined()).or(z.null())
		.optional(),
	from: z.string().or(z.undefined()).or(z.null()).optional(),
	until: z.string().or(z.undefined()).or(z.null()).optional(),
	log_name: z.enum(['hdb.log', 'system.log']).or(z.undefined()).or(z.null()).optional(),
});
