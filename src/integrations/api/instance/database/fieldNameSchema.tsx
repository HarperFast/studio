import { schemaRegex } from '@/features/instance/databases/modals/schemaRegex';
import { z } from 'zod';

export const fieldNameSchema = z
	.string()
	.nonempty({
		error: 'Field name is required.',
	})
	.regex(schemaRegex, {
		error: 'Field name cannot include backticks or forward slashes.',
	})
	.max(250, {
		error: 'Field name cannot be longer than 250 characters.',
	});
