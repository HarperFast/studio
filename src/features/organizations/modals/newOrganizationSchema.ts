import { z } from 'zod';

export const NewOrganizationSchema = z.object({
	name: z
		.string()
		.nonempty({
			error: 'Please enter a name.',
		})
		.max(255, {
			error: 'Name cannot be longer than 255 characters.',
		}),
	subdomain: z
		.string()
		.max(62, {
			error: 'The subdomain cannot be longer than 62 characters.',
		})
		.regex(/^[a-zA-Z0-9-]*$/, {
			error: 'Please only use letters, digits and dashes (-) in the subdomain.',
		}),
});
