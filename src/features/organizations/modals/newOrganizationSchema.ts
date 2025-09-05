import { z } from 'zod';

export const NewOrganizationSchema = z.object({
	name: z
		.string()
		.min(1, {
			error: 'Please enter a name.',
		})
		.max(255, {
			error: 'The name cannot be longer than 255 characters.',
		}),
	subdomain: z
		.string()
		.max(10, {
			error: 'The subdomain cannot be longer than 10 characters.',
		})
		.regex(/^[a-zA-Z0-9-]*$/, {
			error: 'Please only use letters, digits and dashes (-) in the subdomain.',
		}),
});
