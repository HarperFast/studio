import { z } from 'zod';

/**
 * Create/edit form for a region. Mirrors the RegionAdmin validation contract: id, name, counts and
 * a latency blurb are required; preferred locations and the organization (customer) scope are
 * optional arrays. Numbers are kept as numbers (the inputs convert on change) and the arrays carry
 * no schema default so the form's input and output types match — react-hook-form needs that to
 * resolve the resolver generic. Blank/create defaults come from the form's defaultValues instead.
 */
export const RegionFormSchema = z.object({
	// The region's primary key — admin-supplied, immutable after create (e.g. "global-1").
	id: z
		.string()
		.trim()
		.min(1, 'ID is required')
		.regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only'),
	region: z.string().trim().min(1, 'Region is required'),
	instanceCount: z.number({ error: 'Enter a whole number' }).int('Must be a whole number').min(1, 'Must be at least 1'),
	purchasedBlockMultiplier: z
		.number({ error: 'Enter a whole number' })
		.int('Must be a whole number')
		.min(1, 'Must be at least 1'),
	latencyDescription: z.string().trim().min(1, 'Latency description is required'),
	linodePreferredLocations: z.array(z.string()),
	gcpPreferredLocations: z.array(z.string()),
	// When true, deployments are pinned to the preferred locations rather than treating them as hints.
	forceLocations: z.boolean(),
	// false = retired: hidden from the customer provisioning list. New regions default active.
	active: z.boolean(),
	// Empty ⇒ region is available to all organizations (shown as "Public").
	organizationIds: z.array(z.string()),
});

export type RegionFormValues = z.infer<typeof RegionFormSchema>;
