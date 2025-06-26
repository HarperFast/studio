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

type RegionFormInputsProps = {
	control: Control<{
		clusterName: string;
		planTypes: [];
		regions?: { region: string; count: number; cloudProvider: string; price?: string }[] | undefined;
	}>;
	index: number;
	remove: () => void;
	regionLocations: RegionLocations;
	selectedRegions: { region: string; count: number; cloudProvider: string }[] | undefined;
};

export function RegionFormInputs({
	control,
	index,
	remove,
	regionLocations,
	selectedRegions,
	planTypes,
}: RegionFormInputsProps) {
	const selectedRegionValues = new Set(selectedRegions?.filter((_, idx) => idx !== index).map((x) => x.region) ?? []);

	return (
		<div className="grid grid-cols-3 gap-2 mb-4 md:grid-cols-12 md:items-end">
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
							<div>
								<Select onValueChange={planTypeSelectionField.onChange} {...planTypeSelectionField}>
									<SelectTrigger className="w-full">
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
											<SelectItem value="linode">Linode</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
						</FormControl>
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
									countField.onChange(Number(e.target.value));
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
								<Input type="number" placeholder="$0.00" {...priceField} className="max-w-64" min={0} readOnly />
							</FormControl>
						</FormItem>
					)}
				/>
			</div>
			<Button
				type="button"
				variant="destructive"
				className="w-full col-span-3 rounded-full md:col-span-2"
				onClick={() => {
					remove();
				}}
			>
				Remove
			</Button>
		</div>
	);
}
