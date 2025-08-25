import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function pickDefaultDeploymentPerformanceAndRegionPlans(
	form: UseFormReturn<z.infer<typeof NewClusterSchema>>,
	planTypes: SchemaPlan[] | undefined,
	regionLocations: SchemaRegion[] | undefined,
) {
	if (planTypes && regionLocations) {
		const values = form.getValues();
		if (!values.deploymentDescription || !values.performanceDescription || !values.regionPlans.length) {
			const freeColocatedPlan = planTypes
				// TODO: We can remove the "free" conditional once "colocated" is rolled out completely.
				.find(planType => !planType.priceUsd && (planType.deploymentType === 'colocated' || planType.deploymentType === 'free'));
			const allowedRegionIds = freeColocatedPlan?.allowedRegionIds;
			if (freeColocatedPlan && allowedRegionIds?.length) {
				const allowedFreeRegions = regionLocations.filter(regionLocation => allowedRegionIds.includes(regionLocation.id));
				const allowedGlobalFreeRegion = allowedFreeRegions.find(regionLocation => regionLocation.region === 'Global');
				if (allowedGlobalFreeRegion) {
					if (!values.deploymentDescription && !values.performanceDescription) {
						form.setValue('deploymentDescription', freeColocatedPlan.deploymentDescription);
						form.setValue('performanceDescription', freeColocatedPlan.performanceDescription);
					}
					if (!values.regionPlans.length) {
						form.setValue('regionPlans', [
							{
								regionName: allowedGlobalFreeRegion.region,
								latencyDescription: allowedGlobalFreeRegion.latencyDescription,
							},
						]);
					}
				}
			}
		}
	}
}
