import { z } from 'zod';

export const NewOrganizationSchema = z.object({
	name: z
		.string()
		.max(255, {
			error: 'Name cannot be longer than 255 characters.',
		}),
	subdomain: z
		.string()
		.max(62, {
			error: 'The subdomain cannot be longer than 62 characters.',
		})
		.regex(/^[a-z0-9-]*$/, {
			error: 'Please only use lowercase letters, digits and dashes (-) in the subdomain.',
		}),
});
