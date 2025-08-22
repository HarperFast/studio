import { Button } from '@/components/ui/button';
import { RegionFormInputs } from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { PlusIcon } from 'lucide-react';
import { useCallback } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

interface ClusterRegionsProps {
	form: UseFormReturn<z.infer<typeof NewClusterSchema>>;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedPlan: SchemaPlan | undefined;
}

export function ClusterRegions({
	form,
	regionLocations,
	regionNameToLatencyToRegion,
	selectedPlan,
}: ClusterRegionsProps) {
	const selectedRegionPlans = form.watch('regionPlans');

	const regionPlansFieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const onAddARegionClick = useCallback(() => {
		const selectedRegionNames = selectedRegionPlans.map(region => regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!]?.region);
		const firstRegionLocation = regionLocations?.find(r => !selectedRegionNames.includes(r.region));
		if (firstRegionLocation) {
			regionPlansFieldArray.append({
				regionName: firstRegionLocation.region,
				latencyDescription: firstRegionLocation.latencyDescription,
			});
			void form.trigger();
		}
	}, [regionPlansFieldArray, form, regionLocations, regionNameToLatencyToRegion, selectedRegionPlans]);

	return (<>
		{regionPlansFieldArray.fields.map((field, index) => (
			<RegionFormInputs
				control={form.control}
				fieldArray={regionPlansFieldArray}
				form={form}
				index={index}
				key={field.id}
				regionNameToLatencyToRegion={regionNameToLatencyToRegion}
				selectedPlan={selectedPlan}
			/>
		))}

		<div className="md:col-span-6 col-span-3">
			<Button
				type="button"
				variant="positiveOutline"
				className="rounded-full"
				onClick={onAddARegionClick}
			>
				<PlusIcon />
				Add Additional Region Usage
			</Button>
		</div>
	</>);
}
