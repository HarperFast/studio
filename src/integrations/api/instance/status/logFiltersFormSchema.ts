import { z } from 'zod';

export const LogFiltersFormSchema = z.object({
	limit: z.string().or(z.undefined()).or(z.null()),
	level: z.enum(['notify', 'error', 'warn', 'info', 'debug', 'trace', 'undefined']).or(z.undefined()).or(z.null()),
	from: z.string().or(z.undefined()).or(z.null()).optional(),
	until: z.string().or(z.undefined()).or(z.null()).optional(),
});
