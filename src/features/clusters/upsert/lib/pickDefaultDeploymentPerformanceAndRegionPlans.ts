import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { UseFormReturn } from 'react-hook-form';
import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from './calculateDefaultDeploymentPerformanceAndRegionPlans';

export function pickDefaultDeploymentPerformanceAndRegionPlans(
	form: UseFormReturn<UpsertClusterSchemaType>,
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
