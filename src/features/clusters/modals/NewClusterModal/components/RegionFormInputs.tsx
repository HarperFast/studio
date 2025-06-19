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
		abbreviatedName: string;
		instanceTypes: string;
		storage: string;
		regions?: { region: string; count: number; cloudProvider: string }[] | undefined;
	}>;
	index: number;
	remove: () => void;
	regionLocations: RegionLocations;
	selectedRegions: { region: string; count: number; cloudProvider: string }[] | undefined;
};

const RegionFormInputs = ({ control, index, remove, regionLocations, selectedRegions }: RegionFormInputsProps) => {
	const selectedRegionValues = new Set(selectedRegions?.filter((_, idx) => idx !== index).map((x) => x.region) ?? []);

	return (
		<div className="grid grid-cols-3 md:grid-cols-12 md:items-end gap-2 mb-4">
			<FormField
				control={control}
				name={`regions.${index}.region`}
				render={({ field: regionField }) => (
					<FormItem className="col-span-3 md:col-span-4">
						<FormLabel>Region {index + 1}</FormLabel>
						<FormControl>
							<Select onValueChange={regionField.onChange} {...regionField}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Region" />
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
				name={`regions.${index}.cloudProvider`}
				render={({ field: cloudProviderField }) => (
					<FormItem className="col-span-2 md:col-span-4">
						<FormLabel>Cloud Provider</FormLabel>
						<FormControl>
							<Select onValueChange={cloudProviderField.onChange} {...cloudProviderField}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="linode">Linode</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</FormControl>
					</FormItem>
				)}
			/>
			<FormField
				control={control}
				name={`regions.${index}.count`}
				render={({ field: countField }) => (
					<FormItem className="col-span-1 md:col-span-2">
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
			<Button
				type="button"
				variant="destructive"
				className="col-span-3 md:col-span-2 rounded-full w-full"
				onClick={() => {
					remove();
				}}
			>
				Remove
			</Button>
		</div>
	);
};

export default RegionFormInputs;
