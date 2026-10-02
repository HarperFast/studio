import { OrganizationRegion, OrganizationRegionPatch, OrganizationRegionPayload } from '@/integrations/api/api.patch';
import { z } from 'zod';

/** Fields central-manager freezes once a live cluster deploys the region. */
export const FROZEN_WHILE_REFERENCED = ['name', 'linodeDatacenters', 'gcpDatacenters', 'fallbackGroup', 'blocksPerUnit'] as const;

/** The form's "no fallback pool" choice; the API stores null for it. */
export const NO_FALLBACK = '';

/**
 * Create/edit form for an organization's custom region. Mirrors the OrganizationRegion contract: a
 * name unique within the organization, at least one provider's datacenter list (a repeated datacenter
 * asks for another instance there), an optional fallback pool and 1–10 purchased blocks per unit.
 */
export const OrganizationRegionFormSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(64, 'Keep the name to 64 characters'),
	linodeDatacenters: z.array(z.string()),
	gcpDatacenters: z.array(z.string()),
	fallbackGroup: z.string(),
	blocksPerUnit: z.number({ error: 'Enter a whole number' }).int('Must be a whole number').min(1, 'Must be at least 1').max(
		10,
		'At most 10 blocks per unit',
	),
	active: z.boolean(),
}).superRefine((values, ctx) => {
	if (!values.linodeDatacenters.length && !values.gcpDatacenters.length) {
		ctx.addIssue({
			code: 'custom',
			path: ['gcpDatacenters'],
			message: 'Add at least one datacenter under Linode or GCP',
		});
	}
});

export type OrganizationRegionFormValues = z.infer<typeof OrganizationRegionFormSchema>;

export function toFormValues(region?: OrganizationRegion | null): OrganizationRegionFormValues {
	return {
		name: region?.name ?? '',
		linodeDatacenters: region?.placement?.linode ?? [],
		gcpDatacenters: region?.placement?.gcp ?? [],
		fallbackGroup: region?.fallbackGroup ?? NO_FALLBACK,
		blocksPerUnit: region?.blocksPerUnit ?? 1,
		active: region?.active ?? true,
	};
}

export function toCreatePayload(organizationId: string, values: OrganizationRegionFormValues): OrganizationRegionPayload {
	return {
		organizationId,
		name: values.name,
		placement: { linode: values.linodeDatacenters, gcp: values.gcpDatacenters },
		fallbackGroup: values.fallbackGroup === NO_FALLBACK ? null : values.fallbackGroup,
		blocksPerUnit: values.blocksPerUnit,
		active: values.active,
	};
}

/** Only the fields that differ from the stored row, so a frozen field is never resubmitted unchanged. */
export function toPatch(region: OrganizationRegion, values: OrganizationRegionFormValues): OrganizationRegionPatch {
	const stored = toFormValues(region);
	const patch: OrganizationRegionPatch = {};
	if (values.name !== stored.name) {
		patch.name = values.name;
	}
	const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
	if (!sameList(values.linodeDatacenters, stored.linodeDatacenters) || !sameList(values.gcpDatacenters, stored.gcpDatacenters)) {
		patch.placement = { linode: values.linodeDatacenters, gcp: values.gcpDatacenters };
	}
	if (values.fallbackGroup !== stored.fallbackGroup) {
		patch.fallbackGroup = values.fallbackGroup === NO_FALLBACK ? null : values.fallbackGroup;
	}
	if (values.blocksPerUnit !== stored.blocksPerUnit) {
		patch.blocksPerUnit = values.blocksPerUnit;
	}
	if (values.active !== stored.active) {
		patch.active = values.active;
	}
	return patch;
}
