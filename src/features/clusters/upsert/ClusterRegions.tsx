import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Button } from '@/components/ui/button';
import { OrganizationRegionFormModal } from '@/features/admin/organizationRegions/components/OrganizationRegionFormModal';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { MapPinnedIcon, PlusIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { RegionFormInputs } from './components/RegionFormInputs';
import { PremiumOnlyRegions } from './lib/calculatePremiumOnlyRegions';
import { UsageScale } from './lib/calculateUsageScale';
import { regionCohortKey, RegionLookup } from './lib/regionLookup';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterRegionsProps {
	form: UseFormReturn<UpsertClusterSchemaType>;
	regionLocations: SchemaRegion[] | undefined;
	regionLookup: RegionLookup;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	premiumOnlyRegions: PremiumOnlyRegions;
	usageScale: UsageScale;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number | undefined;
	isEnterprise: boolean;
	cloudProvider: keyof SchemaCloudInstanceTypes | undefined;
	organizationId: string;
	/** Staff may pick an organization's custom regions and set their quantity. */
	canUseCustomRegions: boolean;
}

export function ClusterRegions({
	form,
	regionLocations,
	regionLookup,
	regionNameToLatencyToRegion,
	premiumOnlyRegions,
	usageScale,
	selectedPlan,
	totalPrice,
	isEnterprise,
	cloudProvider,
	organizationId,
	canUseCustomRegions,
}: ClusterRegionsProps) {
	const selectedRegionPlans = form.watch('regionPlans');

	const regionPlansFieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const nextAvailableRegionToAdd = useMemo(() => {
		if (!totalPrice) {
			// Free plans can only add a single region.
			return null;
		}
		const selectedCohorts = new Set(
			selectedRegionPlans.map(entry => {
				const region = regionLookup.get(entry.regionId);
				return region ? regionCohortKey(region) : null;
			}),
		);
		return regionLocations?.find(r => !selectedCohorts.has(r.region));
	}, [regionLocations, regionLookup, selectedRegionPlans, totalPrice]);

	const onAddARegionClick = useCallback(() => {
		if (nextAvailableRegionToAdd) {
			regionPlansFieldArray.append({ regionId: nextAvailableRegionToAdd.id });
			void form.trigger();
		}
	}, [form, nextAvailableRegionToAdd, regionPlansFieldArray]);

	const [definingCustomRegion, setDefiningCustomRegion] = useState(false);
	// The new row lands on the form before its refetch reaches the lookup; validation reports it
	// as unavailable until then rather than the row being dropped.
	const onCustomRegionSaved = useCallback((region: OrganizationRegion) => {
		const values = form.getValues('regionPlans');
		const blankIndex = values.findIndex(entry => !entry.regionId);
		if (blankIndex >= 0) {
			form.setValue(`regionPlans.${blankIndex}.regionId`, region.id, { shouldDirty: true });
			form.setValue(`regionPlans.${blankIndex}.quantity`, 1, { shouldDirty: true });
		} else {
			regionPlansFieldArray.append({ regionId: region.id, quantity: 1 });
		}
		void form.trigger();
	}, [form, regionPlansFieldArray]);

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
					regionLookup={regionLookup}
					regionNameToLatencyToRegion={regionNameToLatencyToRegion}
					premiumOnlyRegions={premiumOnlyRegions}
					usageScale={usageScale}
					selectedPlan={selectedPlan}
					isEnterprise={isEnterprise}
					cloudProvider={cloudProvider}
					organizationId={organizationId}
					canUseCustomRegions={canUseCustomRegions}
				/>
			))}

			{(nextAvailableRegionToAdd || canUseCustomRegions) && (
				<div className="md:col-span-6 col-span-3 flex flex-wrap gap-3">
					{nextAvailableRegionToAdd && (
						<Button
							type="button"
							variant="positiveOutline"
							onClick={onAddARegionClick}
						>
							<PlusIcon />
							Add Additional Region Usage
						</Button>
					)}
					{canUseCustomRegions && (
						<Button
							type="button"
							variant="outline"
							onClick={() => setDefiningCustomRegion(true)}
						>
							<MapPinnedIcon />
							Define custom region
						</Button>
					)}
				</div>
			)}
			{canUseCustomRegions && (
				<OrganizationRegionFormModal
					open={definingCustomRegion}
					onOpenChange={setDefiningCustomRegion}
					organizationId={organizationId}
					onSaved={onCustomRegionSaved}
				/>
			)}
		</>
	);
}
