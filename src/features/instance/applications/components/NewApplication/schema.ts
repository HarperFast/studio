import { z } from 'zod';
import { PRIVATE_COPY_OFF, privateCopyError } from '../PrivateDatabaseCopy/privateCopyValue';
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
	// The SSH key the import URL is expected to use. Form-only state used to verify the URL's host
	// — it is not sent to deploy_component (the backend resolves the key from the URL host alias).
	sshKeyName: z.string(),
	stageOnly: z.boolean(),
	privateCopy: z.object({
		mode: z.enum(['off', 'all', 'chosen']),
		databases: z.array(z.string()),
	}).superRefine((value, ctx) => {
		const message = privateCopyError(value);
		if (message) {
			ctx.addIssue({ code: 'custom', message });
		}
	}),
});

export const defaultImportOptions: z.infer<typeof ImportSchema> = {
	type: 'import',
	source: 'git',
	ref: '',
	requiresAuth: false,
	installCommand: '',
	sshKeyName: '',
	stageOnly: false,
	privateCopy: PRIVATE_COPY_OFF,
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
