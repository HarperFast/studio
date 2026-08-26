import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { sortByNumberPrefix } from '@/lib/arrays/sort/byNumberPrefix';
import { MapPinIcon, TrashIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { PremiumOnlyRegions } from '../lib/calculatePremiumOnlyRegions';
import { UsageScale } from '../lib/calculateUsageScale';
import { ResourcesPerInstance } from './ResourcesPerInstance';

type RegionFormInputsProps = {
	control: Control<UpsertClusterSchemaType>;
	/** The plan fixes the region and distribution, so both selects are read-only. */
	disabled?: boolean;
	fieldArray: UseFieldArrayReturn<UpsertClusterSchemaType, 'regionPlans'>;
	form: UseFormReturn<UpsertClusterSchemaType>;
	index: number;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	premiumOnlyRegions: PremiumOnlyRegions;
	usageScale: UsageScale;
	selectedPlan: SchemaPlan | undefined;
	isEnterprise: boolean;
	cloudProvider: keyof SchemaCloudInstanceTypes | undefined;
};

export function RegionFormInputs({
	control,
	disabled,
	fieldArray,
	form,
	index,
	regionNameToLatencyToRegion,
	premiumOnlyRegions,
	usageScale,
	selectedPlan,
	isEnterprise,
	cloudProvider,
}: RegionFormInputsProps) {
	const availableRegionNames = useMemo(() => Object.keys(regionNameToLatencyToRegion).sort(), [
		regionNameToLatencyToRegion,
	]);
	const isDedicated = form.watch('deploymentDescription')?.startsWith('Dedicated');
	const selectedRegionName = form.watch(`regionPlans.${index}.regionName`);
	const selectedLatencyDescription = form.watch(`regionPlans.${index}.latencyDescription`);
	const availableLatencyDescriptions = useMemo(
		() => Object.keys(regionNameToLatencyToRegion[selectedRegionName] || {}).sort(sortByNumberPrefix).reverse(),
		[regionNameToLatencyToRegion, selectedRegionName],
	);

	const allowedRegionIds = selectedPlan?.allowedRegionIds;
	const isRegionAllowedByPlan = useCallback(
		(regionName: string) =>
			!allowedRegionIds?.length
			|| Object.values(regionNameToLatencyToRegion[regionName] || {}).some(region =>
				allowedRegionIds.includes(region.id)
			),
		[allowedRegionIds, regionNameToLatencyToRegion],
	);
	const isLatencyAllowedByPlan = useCallback(
		(latencyDescription: string) => {
			if (!allowedRegionIds?.length) {
				return true;
			}
			const id = regionNameToLatencyToRegion[selectedRegionName]?.[latencyDescription]?.id;
			return !id || allowedRegionIds.includes(id);
		},
		[allowedRegionIds, regionNameToLatencyToRegion, selectedRegionName],
	);

	useEffect(function autoPickLatencyDescription() {
		if (
			selectedRegionName && availableLatencyDescriptions?.length
			&& !availableLatencyDescriptions?.includes(selectedLatencyDescription)
		) {
			const oldValue = selectedLatencyDescription?.split(' ')[0].toLowerCase();
			const newValue = availableLatencyDescriptions.find(description =>
				!oldValue ? true : description.split(' ')[0].toLowerCase() === oldValue
			) || availableLatencyDescriptions[0];
			form.setValue(`regionPlans.${index}.latencyDescription`, newValue);
			void form.trigger();
		}
	}, [availableLatencyDescriptions, form, index, selectedLatencyDescription, selectedRegionName]);

	const onRemoveClicked = useCallback(() => {
		fieldArray?.remove(index);
		void form.trigger();
	}, [fieldArray, form, index]);

	return (
		<div className="md:col-span-6 col-span-3 py-2 pl-4 border-l-4 border-border gap-6 flex flex-wrap items-start">
			<FormField
				control={control}
				name={`regionPlans.${index}.regionName`}
				render={({ field: regionField }) => (
					<FormItem className="flex-1">
						<FormLabel className="flex items-center gap-1.5">
							<MapPinIcon className="size-4 shrink-0" />
							Region {fieldArray.fields.length > 1 ? index + 1 : ''}
						</FormLabel>
						<FormControl>
							<Select
								onValueChange={value => {
									regionField.onChange(value);
									form.trigger();
								}}
								{...regionField}
								disabled={disabled}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Region" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableRegionNames.map((regionName) => (
											<SelectItem key={regionName} value={regionName} disabled={!isRegionAllowedByPlan(regionName)}>
												<span className="flex items-center gap-2">
													{regionName}
													{premiumOnlyRegions.regionNames.has(regionName) && <Badge>Premium</Badge>}
												</span>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name={`regionPlans.${index}.latencyDescription`}
				render={({ field: regionField }) => (
					<FormItem className="flex-1">
						<FormLabel>Estimated {isDedicated ? 'P95' : 'P90'} Latency, Distribution</FormLabel>
						<FormControl>
							<Select
								onValueChange={value => {
									regionField.onChange(value);
									form.trigger();
								}}
								{...regionField}
								disabled={disabled || !availableLatencyDescriptions?.length}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Latency Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableLatencyDescriptions.map((latencyDescription) => (
											<SelectItem
												key={latencyDescription}
												value={latencyDescription}
												disabled={!isLatencyAllowedByPlan(latencyDescription)}
											>
												<span className="flex items-center gap-2">
													{latencyDescription}
													{(() => {
														const id = regionNameToLatencyToRegion[selectedRegionName]?.[latencyDescription]?.id;
														return id && premiumOnlyRegions.regionIds.has(id) && <Badge>Premium</Badge>;
													})()}
												</span>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{!disabled && fieldArray?.fields?.length && fieldArray?.fields?.length > 1 && (
				<div className="flex-none mt-6">
					<Button
						type="button"
						variant="destructiveOutline"
						size="sm"
						onClick={onRemoveClicked}
					>
						<TrashIcon /> <span className="sr-only">Remove</span>
					</Button>
				</div>
			)}
			<ResourcesPerInstance
				selectedPlan={selectedPlan}
				selectedRegion={regionNameToLatencyToRegion[selectedRegionName]?.[selectedLatencyDescription]}
				usageScale={usageScale}
				isEnterprise={isEnterprise}
				cloudProvider={cloudProvider}
			/>
		</div>
	);
}
