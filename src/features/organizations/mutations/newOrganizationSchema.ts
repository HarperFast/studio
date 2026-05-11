import { z } from 'zod';

export const specifiedSubdomain = z
	.string()
	.max(62, { error: 'Must be at most 62 characters long.' })
	.regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, {
		error:
			'Please only use lowercase letters, digits and dashes (-) in the subdomain. Must not start or end with a dash.',
	});

export const NewOrganizationSchema = z.object({
	name: z
		.string()
		.max(255, {
			error: 'Name cannot be longer than 255 characters.',
		}),
	subdomain: z.union([
		z.literal(''),
		z.undefined(),
		specifiedSubdomain,
	]).optional(),
});
