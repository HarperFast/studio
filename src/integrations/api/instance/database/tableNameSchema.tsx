import { schemaRegex } from '@/features/instance/databases/modals/schemaRegex';
import { z } from 'zod';

export const tableNameSchema = z
	.string()
	.nonempty({
		error: 'Table name is required.',
	})
	.regex(schemaRegex, {
		error: 'Table name cannot include backticks or forward slashes.',
	})
	.max(250, {
		error: 'Table name cannot be longer than 250 characters.',
	});
