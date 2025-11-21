import { z } from 'zod';
import { templates } from './templates';

export const TemplateSchema = z.object({
	type: z.literal('template'),
	id: z.string('Please select a template.'),
});

export const defaultTemplateOptions: z.infer<typeof TemplateSchema> = {
	type: 'template',
	id: templates[0].id,
};

export const ImportSchema = z.object({
	type: z.literal('import'),
	source: z.enum(['git', 'npm', 'tarball']),
	ref: z.string().nonempty('Please enter a URL or package reference.'),
	installCommand: z.string(),
	requiresAuth: z.boolean(),
});

export const defaultImportOptions: z.infer<typeof ImportSchema> = {
	type: 'import',
	source: 'git',
	ref: '',
	requiresAuth: false,
	installCommand: '',
};

export const CLISchema = z.object({
	type: z.literal('cli'),
});

export const defaultCLIOptions: z.infer<typeof CLISchema> = {
	type: 'cli',
};

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
