import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { z } from 'zod';

export function calculateDefaultDeploymentPerformanceAndRegionPlans(
	planTypes: SchemaPlan[],
	regionLocations: SchemaRegion[],
): null | Pick<z.infer<typeof UpsertClusterSchema>, 'deploymentDescription' | 'performanceDescription' | 'regionPlans'> {
	const freeColocatedPlan = planTypes
		.find(planType => !planType.priceUsd && planType.deploymentType === 'colocated');
	const allowedRegionIds = freeColocatedPlan?.allowedRegionIds;
	if (freeColocatedPlan && allowedRegionIds?.length) {
		const allowedFreeRegions = regionLocations.filter(regionLocation => allowedRegionIds.includes(regionLocation.id));
		const allowedGlobalFreeRegion = allowedFreeRegions.find(regionLocation => regionLocation.region === 'Global');
		if (allowedGlobalFreeRegion) {
			return {
				deploymentDescription: freeColocatedPlan.deploymentDescription,
				performanceDescription: freeColocatedPlan.performanceDescription,
				regionPlans: [
					{
						regionName: allowedGlobalFreeRegion.region,
						latencyDescription: allowedGlobalFreeRegion.latencyDescription,
					},
				],
			};
		}
	}
	return null;
}
