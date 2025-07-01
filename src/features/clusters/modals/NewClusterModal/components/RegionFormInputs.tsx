import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RegionLocations } from '@/features/clusters/queries/getRegionLocationsQuery';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectGroup,
	SelectLabel,
	SelectItem,
} from '@/components/ui/select';
import { Control } from 'react-hook-form';
import { useCallback } from 'react';
import { PlanTypes } from '@/features/cluster/queries/getPlanTypesQuery';

type RegionFormInputsProps = {
	control: Control<{
		regions: {
			region: string;
			planType: string;
			count?: number;
			price: string;
		}[];
	}>;
	index: number;
	remove: () => void;
	regionLocations: RegionLocations;
	selectedRegions: { region: string; count: number; planType: string; price: string }[];
	planTypes?: PlanTypes;
};

export function RegionFormInputs({
	control,
	index,
	remove,
	regionLocations,
	selectedRegions,
	planTypes,
}: RegionFormInputsProps) {
	const getPlanObj = useCallback(
		(planId: string | undefined) => {
			return planTypes?.find((plan) => plan.id === planId);
		},
		[planTypes]
	);

	const getPlanPrice = useCallback(
		(planId: string | undefined) => {
			const priceAsStr = getPlanObj(planId)?.price?.replace(/\$/g, '') ?? '0';
			return parseInt(priceAsStr);
		},
		[getPlanObj]
	);

	const selectedRegionValues = new Set(selectedRegions?.filter((_, idx) => idx !== index).map((x) => x.region) ?? []);
	const currentPlanTypeObj = getPlanObj(selectedRegions?.[index]?.planType);
	const currentSelectedRegion = selectedRegions?.[index];
	const currentSelectedRegionCount = currentSelectedRegion?.count ?? 0;
	const planPrice = getPlanPrice(selectedRegions?.[index]?.planType);

	const currentPrice = planPrice * currentSelectedRegionCount;

	const updateSelectionPrice = useCallback(
		({ planId, count }: { planId?: string; count?: number }) => {
			if (currentSelectedRegion) {
				const newPlanPrice = planId ? getPlanPrice(planId) : planPrice;
				const newCount = count ?? currentSelectedRegion.count;
				currentSelectedRegion.price = (newPlanPrice * newCount).toFixed(2);
			}
		},
		[getPlanPrice, planPrice, currentSelectedRegion]
	);

	const { cpuCores, memoryMb, readIopsLimit, writeIopsLimit, storageGb, threads } =
		currentPlanTypeObj?.resourcesPerInstance ?? {};
	return (
		<div className="grid grid-cols-3 gap-2 mb-4 md:grid-cols-12 md:items-start">
			<FormField
				control={control}
				name={`regions.${index}.region`}
				render={({ field: regionField }) => (
					<FormItem className="col-span-3 md:col-span-3">
						<FormLabel>Region {index + 1}</FormLabel>
						<FormControl>
							<Select onValueChange={regionField.onChange} {...regionField}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Region" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel>Region</SelectLabel>
										{regionLocations?.map((regionLocation) => (
											<SelectItem
												key={regionLocation.id}
												value={regionLocation.id}
												disabled={selectedRegionValues.has(regionLocation.id)}
											>
												{regionLocation.region}
												{/* <small>{regionLocation.latencyDescription}</small> */}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<small className="text-xs text-muted-foreground">
							{regionLocations?.find((r) => r.id === regionField.value)?.latencyDescription || ''}
						</small>
					</FormItem>
				)}
			/>
			<FormField
				control={control}
				name={`regions.${index}.planType`}
				render={({ field: planTypeSelectionField }) => (
					<FormItem className="col-span-3 md:col-span-4">
						<FormLabel>Plan Type</FormLabel>
						<FormControl>
							<Select
								onValueChange={(planId) => {
									planTypeSelectionField.onChange(planId);
									updateSelectionPrice({ planId });
								}}
								{...planTypeSelectionField}
							>
								<SelectTrigger className="w-full truncate" title={currentPlanTypeObj?.name}>
									<SelectValue placeholder="Choose Plan" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectLabel>Plan</SelectLabel>
										{planTypes?.map((planType) => (
											<SelectItem key={planType.id} value={planType.id}>
												{planType.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
						<small className="text-xs text-muted-foreground">
							{currentPlanTypeObj?.resourcesPerInstance ? (
								<>
									{cpuCores} CPU Cores /{threads} Threads /{memoryMb} MB Memory /{storageGb} GB Storage /{readIopsLimit}{' '}
									Read IOPS /{writeIopsLimit} Write IOPS
								</>
							) : null}
						</small>
					</FormItem>
				)}
			/>
			<FormField
				control={control}
				name={`regions.${index}.count`}
				render={({ field: countField }) => (
					<FormItem className="col-span-1 md:col-span-1">
						<FormLabel>Count</FormLabel>
						<FormControl>
							<Input
								type="number"
								placeholder="Count"
								{...countField}
								className="max-w-64"
								min={0}
								onChange={(e) => {
									const count = e.target.valueAsNumber;
									updateSelectionPrice({ count });
									countField.onChange(count);
								}}
							/>
						</FormControl>
					</FormItem>
				)}
			/>
			<div className="col-span-1 md:col-span-2">
				<FormField
					control={control}
					name={`regions.${index}.price`}
					render={({ field: priceField }) => (
						<FormItem className="col-span-1 md:col-span-1">
							<FormLabel>Price</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="$0.00"
									{...priceField}
									value={currentPrice.toFixed(2)}
									className="max-w-64"
									min={0}
									readOnly
								/>
							</FormControl>
						</FormItem>
					)}
				/>
			</div>
			<Button
				type="button"
				variant="destructive"
				className="w-full col-span-3 mt-5 rounded-full md:col-span-2"
				onClick={() => {
					remove();
				}}
			>
				Remove
			</Button>
		</div>
	);
}
