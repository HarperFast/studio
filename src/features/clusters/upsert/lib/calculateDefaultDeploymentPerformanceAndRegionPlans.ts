import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { z } from 'zod';

export function calculateDefaultDeploymentPerformanceAndRegionPlans(
	planTypes: SchemaPlan[],
	regionLocations: SchemaRegion[],
	alreadyUsingFree?: boolean,
): null | Pick<z.infer<typeof UpsertClusterSchema>, 'deploymentDescription' | 'performanceDescription' | 'regionPlans'> {
	const planToSelect = planTypes.find(planType => (alreadyUsingFree ? !!planType.priceUsd : !planType.priceUsd) && planType.deploymentType === 'colocated')
		|| planTypes.find(planType => planType.deploymentType === 'colocated')
		|| planTypes[0];
	const allowedRegionIds = planToSelect?.allowedRegionIds;
	if (planToSelect) {
		const allowedRegions = allowedRegionIds ? regionLocations.filter(regionLocation => allowedRegionIds.includes(regionLocation.id)) : regionLocations;
		const regionToSelect = allowedRegions.find(regionLocation => regionLocation.region === 'Global') || allowedRegions[0];
		if (regionToSelect) {
			return {
				deploymentDescription: planToSelect.deploymentDescription,
				performanceDescription: planToSelect.performanceDescription,
				regionPlans: [
					{
						regionName: regionToSelect.region,
						latencyDescription: regionToSelect.latencyDescription,
					},
				],
			};
		}
	}
	return null;
}
