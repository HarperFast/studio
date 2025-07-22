import { z } from 'zod';

export const NewOrganizationSchema = z.object({
	name: z
		.string()
		.min(1, {
			message: 'Please enter a name.',
		})
		.max(255, {
			message: 'The name cannot be longer than 255 characters.',
		}),
	subdomain: z
		.string()
		.max(62, {
			message: 'The subdomain cannot be longer than 62 characters.',
		})
		.regex(/^[a-zA-Z0-9-]*$/, {
			message: 'Please only use letters, digits and dashes (-) in the subdomain.',
		}),
});
