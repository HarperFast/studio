import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { SchemaRegion } from '@/lib/api.gen';
import { Plan } from '@/lib/api.patch';
import { TrashIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

type RegionFormInputsProps = {
	control: Control<z.infer<typeof NewClusterSchema>>,
	fieldArray?: UseFieldArrayReturn<z.infer<typeof NewClusterSchema>, 'regionPlans'>,
	form: UseFormReturn<z.infer<typeof NewClusterSchema>>,
	index: number,
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>,
	selectedPlan: Plan | undefined,
};

export function RegionFormInputs({
	control,
	fieldArray,
	form,
	index,
	regionNameToLatencyToRegion,
	// selectedPlan,
}: RegionFormInputsProps) {
	const availableRegionNames = useMemo(() =>
		Object.keys(regionNameToLatencyToRegion), [regionNameToLatencyToRegion]);
	const selectedRegionName = form.watch(`regionPlans.${index}.regionName`);
	const selectedLatencyDescription = form.watch(`regionPlans.${index}.latencyDescription`);
	// const selectedRegion = regionNameToLatencyToRegion?.[selectedRegionName]?.[selectedLatencyDescription];
	const availableLatencyDescriptions = useMemo(() =>
		Object.keys(regionNameToLatencyToRegion[selectedRegionName] || {}), [regionNameToLatencyToRegion, selectedRegionName]);


	useEffect(() => {
		if (selectedRegionName && availableLatencyDescriptions?.length && !availableLatencyDescriptions?.includes(selectedLatencyDescription)) {
			const oldValue = selectedLatencyDescription?.split(' ')[0].toLowerCase();
			// Try our best to pick a similar value to the latency they had selected.
			const newValue = availableLatencyDescriptions.find(description => !oldValue ? true : description.split(' ')[0].toLowerCase() === oldValue) || availableLatencyDescriptions[0];
			form.setValue(`regionPlans.${index}.latencyDescription`, newValue);
		}
	}, [availableLatencyDescriptions, form, index, selectedLatencyDescription, selectedRegionName]);

	// TODO: plan.price * (region.instanceCount / 2)

	// const getPlanObj = useCallback(
	// 	(planId: string | undefined) => {
	// 		return planTypes?.find((plan) => plan.id === planId);
	// 	},
	// 	[planTypes],
	// );

	// const getPlanPrice = useCallback(
	// 	(planId: string | undefined) => {
	// 		const priceAsStr = getPlanObj(planId)?.price?.replace(/\$/g, '') ?? '0';
	// 		return parseInt(priceAsStr);
	// 	},
	// 	[getPlanObj],
	// );
	// const currentSelectedRegion = selectedRegions?.[index];

	// const selectedRegionValues = new Set(selectedRegions?.filter((_, idx) => idx !== index).map((x) => x.regionId) ?? []);
	// const currentPlanTypeObj = getPlanObj(selectedRegions?.[index]?.planId);
	// const currentSelectedRegionCount = currentSelectedRegion?.count ?? 0;
	// const planPrice = getPlanPrice(selectedRegions?.[index]?.planId);

	// const currentPrice = planPrice * currentSelectedRegionCount;

	// const updateSelectionPrice = useCallback(
	// 	({ planId, count }: { planId?: string; count?: number }) => {
	// 		if (currentSelectedRegion) {
	// 			const newPlanPrice = planId ? getPlanPrice(planId) : planPrice;
	// 			const newCount = count ?? currentSelectedRegion.count;
	// 			currentSelectedRegion.price = (newPlanPrice * newCount).toFixed(2);
	// 		}
	// 	},
	// 	[getPlanPrice, planPrice, currentSelectedRegion],
	// );

	// const { cpuCores, memoryMb, readIopsLimit, writeIopsLimit, storageGb, threads } =
	// currentPlanTypeObj?.resourcesPerInstance ?? {};
	// <div className="p-4 overflow-y-auto rounded-md md:col-span-6 bg-accent min-h-32 max-h-70">

	const remove = useCallback(() => {
		fieldArray?.remove(index);
	}, [fieldArray, index]);

	const selectedRegions = [];
	return (
		<div className="md:col-span-6 p-4 rounded-md bg-accent gap-6 flex flex-wrap">
			<FormField
				control={control}
				name={`regionPlans.${index}.regionName`}
				render={({ field: regionField }) => (
					<FormItem className="flex-1">
						<FormLabel>Region {selectedRegions.length > 1 ? index + 1 : ''}</FormLabel>
						<FormControl>
							<Select onValueChange={regionField.onChange} {...regionField}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Region" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel>Region</SelectLabel>
										{availableRegionNames.map((regionName) => (
											<SelectItem key={regionName} value={regionName}>{regionName}</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name={`regionPlans.${index}.latencyDescription`}
				render={({ field: regionField }) => (
					<FormItem className="flex-1">
						<FormLabel>Latency &amp; Distribution</FormLabel>
						<FormControl>
							<Select onValueChange={regionField.onChange} {...regionField} disabled={!availableLatencyDescriptions?.length}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Latency Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel>Latency & Distribution</SelectLabel>
										{availableLatencyDescriptions.map((latencyDescription) => (
											<SelectItem key={latencyDescription} value={latencyDescription}>{latencyDescription}</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
					</FormItem>
				)}
			/>

			{fieldArray?.fields?.length && fieldArray?.fields?.length > 1 && <div className="flex-none self-end mb-0.5">
				<Button
					type="button"
					variant="destructiveOutline"
					size="sm"
					onClick={remove}
				>
					<TrashIcon /> <span className="sr-only">Remove</span>
				</Button>
			</div>}
		</div>
	);
}
