import { z } from 'zod';

export const NewClusterSchema = z.object({
	systemName: z.string()
		.min(1, 'Must be at least 1 character long.')
		.max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z
		.string()
		.max(20, 'Must be at most 20 characters long.')
		.regex(/^[a-zA-Z0-9-]*$/, 'Can only contain letters, numbers and dashes'),

	deploymentDescription: z.string().min(1, 'Please select a deployment tier.'),
	performanceDescription: z.string().min(1, 'Please select a performance tier.'),

	regionPlans: z.array(
		z.object({
			regionName: z.string().nonempty('Please select a region.'),
			latencyDescription: z.string().nonempty('Please select a latency tier.'),
		}),
	),
});
