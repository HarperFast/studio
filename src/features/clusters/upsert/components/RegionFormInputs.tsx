import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { sortByNumberPrefix } from '@/lib/arrays/sort/byNumberPrefix';
import { TrashIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ResourcesPerInstance } from '@/features/clusters/upsert/components/ResourcesPerInstance.tsx';

type RegionFormInputsProps = {
	control: Control<z.infer<typeof UpsertClusterSchema>>,
	fieldArray: UseFieldArrayReturn<z.infer<typeof UpsertClusterSchema>, 'regionPlans'>,
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>,
	index: number,
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>,
	selectedPlan: SchemaPlan | undefined,
};

export function RegionFormInputs({
	control,
	fieldArray,
	form,
	index,
	regionNameToLatencyToRegion,
 	selectedPlan
}: RegionFormInputsProps) {
	const availableRegionNames = useMemo(() =>
		Object.keys(regionNameToLatencyToRegion).sort(), [regionNameToLatencyToRegion]);
	const isDedicated = form.watch('deploymentDescription')?.startsWith('Dedicated');
	const selectedRegionName = form.watch(`regionPlans.${index}.regionName`);
	const selectedLatencyDescription = form.watch(`regionPlans.${index}.latencyDescription`);
	const availableLatencyDescriptions = useMemo(() =>
		Object.keys(regionNameToLatencyToRegion[selectedRegionName] || {}).sort(sortByNumberPrefix).reverse(), [regionNameToLatencyToRegion, selectedRegionName]);

	useEffect(function autoPickLatencyDescription() {
		if (selectedRegionName && availableLatencyDescriptions?.length && !availableLatencyDescriptions?.includes(selectedLatencyDescription)) {
			const oldValue = selectedLatencyDescription?.split(' ')[0].toLowerCase();
			const newValue = availableLatencyDescriptions.find(description => !oldValue ? true : description.split(' ')[0].toLowerCase() === oldValue) || availableLatencyDescriptions[0];
			form.setValue(`regionPlans.${index}.latencyDescription`, newValue);
			void form.trigger();
		}
	}, [availableLatencyDescriptions, form, index, selectedLatencyDescription, selectedRegionName]);

	const onRemoveClicked = useCallback(() => {
		fieldArray?.remove(index);
		void form.trigger();
	}, [fieldArray, form, index]);

	return (
		<div className="md:col-span-6 col-span-3 p-4 rounded-md bg-accent gap-6 flex flex-wrap items-start">
			<FormField
				control={control}
				name={`regionPlans.${index}.regionName`}
				render={({ field: regionField }) => (
					<FormItem className="flex-1">
						<FormLabel>Region {fieldArray.fields.length > 1 ? index + 1 : ''}</FormLabel>
						<FormControl>
							<Select onValueChange={value => { regionField.onChange(value); form.trigger(); } } {...regionField}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Region" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableRegionNames.map((regionName) => (
											<SelectItem key={regionName} value={regionName}>{regionName}</SelectItem>
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
							<Select onValueChange={value => { regionField.onChange(value); form.trigger(); } } {...regionField} disabled={!availableLatencyDescriptions?.length}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Latency Tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{availableLatencyDescriptions.map((latencyDescription) => (
											<SelectItem key={latencyDescription} value={latencyDescription}>{latencyDescription}</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{fieldArray?.fields?.length && fieldArray?.fields?.length > 1 && (
				<div className="flex-none mt-6">
					<Button
						type="button"
						variant="destructiveOutline"
						size="sm"
						onClick={onRemoveClicked}>
						<TrashIcon /> <span className="sr-only">Remove</span>
					</Button>
				</div>
			)}
			<ResourcesPerInstance planLimits={selectedPlan?.planLimits} resourcesPerInstance={selectedPlan?.resourcesPerInstance} selectedRegion={regionNameToLatencyToRegion[selectedRegionName]?.[selectedLatencyDescription
				]}/>
		</div>
	);
}
