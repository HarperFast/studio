import { Button } from '@/components/ui/button';
import { RegionFormInputs } from '@/features/clusters/upsert/components/RegionFormInputs';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { PlusIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

interface ClusterRegionsProps {
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
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

	const nextAvailableRegionToAdd = useMemo(() => {
		const selectedRegionNames = selectedRegionPlans.map(region => regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!]?.region);
		return regionLocations?.find(r => !selectedRegionNames.includes(r.region));
	}, [regionLocations, regionNameToLatencyToRegion, selectedRegionPlans]);

	const onAddARegionClick = useCallback(() => {
		if (nextAvailableRegionToAdd) {
			regionPlansFieldArray.append({
				regionName: nextAvailableRegionToAdd.region,
				latencyDescription: nextAvailableRegionToAdd.latencyDescription,
			});
			void form.trigger();
		}
	}, [form, nextAvailableRegionToAdd, regionPlansFieldArray]);

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

		{nextAvailableRegionToAdd && (<div className="md:col-span-6 col-span-3">
			<Button
				type="button"
				variant="positiveOutline"
				className="rounded-full"
				onClick={onAddARegionClick}
			>
				<PlusIcon />
				Add Additional Region Usage
			</Button>
		</div>)}
	</>);
}
