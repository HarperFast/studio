import { z } from 'zod';

export const NewClusterSchema = z.object({
	name: z.string()
		.min(1, 'Must be at least 1 character long.')
		.max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z
		.string()
		.max(20, 'Must be at most 20 characters long.')
		.regex(/^[a-zA-Z0-9-]*$/, 'Can only contain letters, numbers and dashes'),
	regionPlans: z.array(
		z.object({
			regionId: z.string().nonempty('Region is required.'),
			planId: z.string().nonempty('Plan Type is required.'),
			count: z.number().min(0, 'Count must be non-negative.').min(1, 'Count must be at least 1.'),
			price: z.string(),
		}),
	),
});
