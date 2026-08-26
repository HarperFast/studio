import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Button } from '@/components/ui/button';
import { OrganizationRegionFormModal } from '@/features/admin/organizationRegions/components/OrganizationRegionFormModal';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { MapPinnedIcon, PlusIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { RegionFormInputs } from './components/RegionFormInputs';
import { PremiumOnlyRegions } from './lib/calculatePremiumOnlyRegions';
import { UsageScale } from './lib/calculateUsageScale';
import { regionCohortKey, RegionLookup } from './lib/regionLookup';
import { RegionPlanEntry, UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterRegionsProps {
	/** Lock the region set: the plan prescribes it, so changing it can only be refused. */
	disabled?: boolean;
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
	disabled,
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

	const nextAvailableRegionToAdd = useMemo(() => {
		const selectedRegionNames = selectedRegionPlans.map(region =>
			regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!]?.region
		);
		if (!totalPrice || disabled) {
			// Free plans — and any plan whose region set is fixed — get a single region.
			return null;
		}
		return regionLocations?.find(r => !selectedRegionNames.includes(r.region));
	}, [disabled, regionLocations, regionNameToLatencyToRegion, selectedRegionPlans, totalPrice]);

	const onAddARegionClick = useCallback(() => {
		if (nextAvailableRegionToAdd) {
			regionPlansFieldArray.append(nextAvailableRegionToAdd);
			void form.trigger();
		}
	}, [form, nextAvailableRegionToAdd, regionPlansFieldArray]);

	const [definingCustomRegion, setDefiningCustomRegion] = useState(false);
	// Defining a region only adds it to the picker's Custom regions group: staff define as many as
	// the organization needs, then choose which ones this cluster deploys.
	const onCustomRegionSaved = useCallback((region: OrganizationRegion) => {
		toast.success(`${region.name} is ready to pick under Custom regions`);
	}, []);

	const offersCustomRegion = lockedOrganizationRegionIds.length > 0 || canDefineCustomRegions
		|| (canUseCustomRegions
			&& [...regionLookup.values()].some(region =>
				region.kind === 'organization' && region.active && region.instanceCount > 0
			));
	if (!regionLocations?.length && !offersCustomRegion) {
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
					disabled={disabled}
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
					selectedRegionIds={selectedRegionPlans.map(entry => entry.regionId)}
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
