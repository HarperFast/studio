import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant, GrantShapeEntry } from '@/integrations/api/api.patch';
import { UpsertClusterSchemaType } from '../upsertClusterSchema';

export interface GrantPrefill {
	deploymentDescription: string;
	performanceDescription: string;
	regionPlans: UpsertClusterSchemaType['regionPlans'];
	/** Plans the shape also names that a one-plan form cannot show alongside the first. */
	otherPlanIds: string[];
}

/**
 * What a comp's shape dictates for the cluster form. The form shows one plan for every region, so
 * the shape's first plan sets deployment and performance and its regions become the rows; any
 * other plan in the shape is reported rather than dropped. The request itself is built from the
 * shape verbatim (see plansFromShape), so the pickers are display and the lock is what matters.
 * Null for a grant without a shape (a trial, which scopes by allow-lists and needs no lock) or
 * one whose plan the catalogue does not know.
 */
export function prefillFromGrant(
	grant: Pick<ClusterGrant, 'shape'> | null | undefined,
	planTypes: SchemaPlan[] | undefined,
	regionsColocated: SchemaRegion[] | undefined,
	regionsDedicated: SchemaRegion[] | undefined,
): GrantPrefill | null {
	const shape = grant?.shape ?? [];
	if (shape.length === 0) { return null; }
	const plan = planTypes?.find((candidate) => candidate.id === shape[0].planId);
	if (!plan?.deploymentDescription || !plan.performanceDescription) { return null; }
	const otherPlanIds = [...new Set(shape.map((entry) => entry.planId).filter((id) => id !== plan.id))];
	const regions = plan.deploymentDescription === 'Dedicated' ? regionsDedicated : regionsColocated;
	const regionPlans: GrantPrefill['regionPlans'] = [];
	for (const entry of shape) {
		if (entry.planId !== plan.id || entry.regionId == null) { continue; }
		const region = regions?.find((candidate) => candidate.id === entry.regionId);
		if (region?.region && region.latencyDescription) {
			regionPlans.push({ regionName: region.region, latencyDescription: region.latencyDescription });
		}
	}
	return {
		deploymentDescription: plan.deploymentDescription,
		performanceDescription: plan.performanceDescription,
		regionPlans,
		otherPlanIds,
	};
}

/**
 * The regionPlans a claim must carry: the comp's shape, verbatim, since central-manager admits the
 * claim only when the pairs match exactly. Hosted rows are the pairs as given; a self-hosted row
 * has no region, so each of the form's instances takes that plan.
 */
export function plansFromShape(
	shape: GrantShapeEntry[],
	instances: UpsertClusterSchemaType['instances'],
	defaultOperationsApiPort: number,
): Array<
	{ autoRenew: true; planId: string; regionId: string } | {
		autoRenew: true;
		planId: string;
		instanceFqdn: string;
		operationsApiPort: number;
		operationsApiSecure: boolean;
	}
> {
	const hosted = shape.filter((entry) => entry.regionId != null);
	if (hosted.length > 0) {
		return hosted.map((entry) => ({ autoRenew: true, planId: entry.planId, regionId: entry.regionId! }));
	}
	return instances.map((instance) => ({
		autoRenew: true,
		planId: shape[0].planId,
		instanceFqdn: instance.fqdn,
		operationsApiPort: instance.port || defaultOperationsApiPort,
		operationsApiSecure: instance.secure === 'true',
	}));
}
