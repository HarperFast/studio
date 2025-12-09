import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Button } from '@/components/ui/button';
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { PlusIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { RegionFormInputs } from './components/RegionFormInputs';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterRegionsProps {
	form: UseFormReturn<UpsertClusterSchemaType>;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number | undefined;
}

export function ClusterRegions({
	form,
	regionLocations,
	regionNameToLatencyToRegion,
	selectedPlan,
	totalPrice,
}: ClusterRegionsProps) {
	const selectedRegionPlans = form.watch('regionPlans');

	const regionPlansFieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const nextAvailableRegionToAdd = useMemo(() => {
		const selectedRegionNames = selectedRegionPlans.map(region =>
			regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!]?.region
		);
		if (!totalPrice) {
			// Free plans can only add a single region.
			return null;
		}
		return regionLocations?.find(r => !selectedRegionNames.includes(r.region));
	}, [regionLocations, regionNameToLatencyToRegion, selectedRegionPlans, totalPrice]);

	const onAddARegionClick = useCallback(() => {
		if (nextAvailableRegionToAdd) {
			regionPlansFieldArray.append({
				regionName: nextAvailableRegionToAdd.region,
				latencyDescription: nextAvailableRegionToAdd.latencyDescription,
			});
			void form.trigger();
		}
	}, [form, nextAvailableRegionToAdd, regionPlansFieldArray]);

	if (!regionLocations?.length) {
		return (
			<div className="md:col-span-6 col-span-3">
				<ErrorComponent
					className="mt-0 m-0"
					title="No Regions Available"
					showReturnToHome={false}
					error={{
						message: (
							<>
								The deployment type you selected currently has no available regions. Please try a different deployment
								type, try again later, or <ContactUs />.
							</>
						),
					}}
				/>
			</div>
		);
	}

	return (
		<>
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

			{nextAvailableRegionToAdd && (
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
			)}
		</>
	);
}
