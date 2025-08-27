import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from '@/features/clusters/upsert/lib/calculateDefaultDeploymentPerformanceAndRegionPlans';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

export function pickDefaultDeploymentPerformanceAndRegionPlans(
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>,
	planTypes: SchemaPlan[] | undefined,
	regionLocations: SchemaRegion[] | undefined,
) {
	if (planTypes && regionLocations) {
		const values = form.getValues();
		if (!values.deploymentDescription || !values.performanceDescription || !values.regionPlans.length) {
			const defaults = calculateDefaultDeploymentPerformanceAndRegionPlans(planTypes, regionLocations);
			if (defaults) {
				if (!values.deploymentDescription && !values.performanceDescription) {
					form.setValue('deploymentDescription', defaults.deploymentDescription);
					form.setValue('performanceDescription', defaults.performanceDescription);
				}
				if (!values.regionPlans.length) {
					form.setValue('regionPlans', defaults.regionPlans);
				}
			}
		}
	}
}
