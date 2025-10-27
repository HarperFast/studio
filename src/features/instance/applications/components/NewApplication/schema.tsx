import { z } from 'zod';

export const TemplateSchema = z.object({
	type: z.literal('template'),
	id: z.string('Please select a template.'),
});

export const ImportSchema = z.object({
	type: z.literal('import'),
	source: z.enum(['git', 'npm', 'tarball']),
	ref: z.string().nonempty('Please enter a URL or package reference.'),
	installCommand: z.string(),
	requiresAuth: z.literal(false),
});

export const CLISchema = z.object({
	type: z.literal('cli'),
	completed: z.boolean('Please follow the steps above to create and deploy your application via the CLI.'),
});

export const NewApplicationSchema = z.object({
	applicationName: z
		.string()
		.trim()
		.max(75, { error: 'Application name cannot be longer than 75 characters.' })
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	contents: z.discriminatedUnion('type', [
		TemplateSchema,
		ImportSchema,
		CLISchema,
	]),
});
