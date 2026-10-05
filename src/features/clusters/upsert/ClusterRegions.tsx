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
import { RegionPlanEntry, UpsertClusterSchemaType } from './upsertClusterSchema';

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
	canUseCustomRegions: boolean;
	canDefineCustomRegions: boolean;
	/** Custom regions the server already has on this cluster; a member keeps these, read-only. */
	lockedOrganizationRegionIds: string[];
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
	canDefineCustomRegions,
	lockedOrganizationRegionIds,
}: ClusterRegionsProps) {
	const selectedRegionPlans = form.watch('regionPlans');

	const regionPlansFieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const nextAvailableRegionToAdd = useMemo<RegionPlanEntry | null>(() => {
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
		const nextCatalogRegion = regionLocations?.find(r => !selectedCohorts.has(r.region));
		if (nextCatalogRegion) {
			return { regionId: nextCatalogRegion.id };
		}
		if (canUseCustomRegions) {
			for (const region of regionLookup.values()) {
				if (
					region.kind === 'organization' && region.active && region.instanceCount > 0
					&& !selectedCohorts.has(region.id)
				) {
					return { regionId: region.id, quantity: 1 };
				}
			}
		}
		return null;
	}, [canUseCustomRegions, regionLocations, regionLookup, selectedRegionPlans, totalPrice]);

	const onAddARegionClick = useCallback(() => {
		if (nextAvailableRegionToAdd) {
			regionPlansFieldArray.append(nextAvailableRegionToAdd);
			void form.trigger();
		}
	}, [form, nextAvailableRegionToAdd, regionPlansFieldArray]);

	const [definingCustomRegion, setDefiningCustomRegion] = useState(false);
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
					lockedOrganizationRegionIds={lockedOrganizationRegionIds}
				/>
			))}

			{(nextAvailableRegionToAdd || canDefineCustomRegions) && (
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
					{canDefineCustomRegions && (
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
			{canDefineCustomRegions && (
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
