import { hostNameRegex } from '@/lib/string/regex/hostNameRegex';
import { maxPortNumber, minPortNumber } from '@/lib/types/portNumbers';
import { z } from 'zod';

export const UpsertClusterSchema = z.object({
	systemName: z.string()
		.nonempty('Please enter a system name.')
		.max(255, 'System name cannot be longer than 255 characters long.'),
	abbreviatedName: z
		.string()
		.max(20, 'Must be at most 20 characters long.')
		.regex(/^[a-zA-Z0-9-]*$/, 'Can only contain letters, numbers and dashes')
		.optional(),
	fqdn: z
		.string()
		.regex(hostNameRegex, 'Please enter a valid host name without the port or any path.')
		.optional(),

	deploymentDescription: z.string().nonempty('Please select a deployment tier.'),
	performanceDescription: z.string().nonempty('Please select a performance tier.'),

	regionPlans: z.array(
		z.object({
			regionName: z.string().nonempty('Please select a region.'),
			latencyDescription: z.string().nonempty('Please select a latency tier.'),
		}),
	).max(50, { error: 'A maximum of 50 regions can be selected for each cluster. ' }),

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
	).max(100, { error: 'A maximum of 100 instances can be added to each cluster.' }),
});
