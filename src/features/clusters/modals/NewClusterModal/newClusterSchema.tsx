import { hostNameRegex } from '@/lib/string/regex/hostNameRegex';
import { maxPortNumber, minPortNumber } from '@/lib/types/portNumbers';
import { z } from 'zod';

export const NewClusterSchema = z.object({
	systemName: z.string()
		.min(1, 'Must be at least 1 character long.')
		.max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z
		.string()
		.max(10, 'Must be at most 10 characters long.')
		.regex(/^[a-zA-Z0-9-]*$/, 'Can only contain letters, numbers and dashes'),
	fqdn: z
		.string()
		.regex(hostNameRegex, 'Please enter a valid host name without the port or any path.')
		.optional(),

	deploymentDescription: z.string().min(1, 'Please select a deployment tier.'),
	performanceDescription: z.string().min(1, 'Please select a performance tier.'),

	regionPlans: z.array(
		z.object({
			regionName: z.string().nonempty('Please select a region.'),
			latencyDescription: z.string().nonempty('Please select a latency tier.'),
		}),
	),

	instances: z.array(
		z.object({
			secure: z.enum(['true', 'false']),
			fqdn: z.string()
				.nonempty('Please enter the host name of your instance.')
				.regex(hostNameRegex, 'Please enter a valid host name without the port or any path.'),
			port: z.number()
				.min(minPortNumber, 'Positive thinking only, please.')
				.max(maxPortNumber, 'That port number is too high.')
				.optional(),
		}),
	),
});
