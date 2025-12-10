import { z } from 'zod';
import { schemaRegex } from './schemaRegex';

export const databaseNameSchema = z
	.string()
	.regex(schemaRegex, {
		error: 'Database name cannot include backticks or forward slashes.',
	})
	.max(75, { error: 'Database name cannot be longer than 75 characters.' });
