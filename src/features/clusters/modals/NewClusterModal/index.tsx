import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, Plus, PlusIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { NewClusterInfo, useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/react-query/constants';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectGroup,
	SelectLabel,
	SelectItem,
} from '@/components/ui/select';
import { getInstanceTypeOptions } from '@/features/cluster/queries/getInstanceTypeQuery';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { Input } from '@/components/ui/input';
import RegionFormInputs from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { InstanceTypes, renderInstanceTypeOption } from '@/shared/functions/InstanceType';

// TODO: consolidate this with the storage size options in the NewInstanceModal
const storageSizeOptions = [
	{ value: '1', label: '1GB' },
	{ value: '10', label: '10GB' },
	{ value: '100', label: '100GB' },
	{ value: '250', label: '250GB' },
	{ value: '500', label: '500GB' },
	{ value: '1000', label: '1TB' },
	{ value: '1500', label: '1.5TB' },
	{ value: '2000', label: '2TB' },
	{ value: '2500', label: '2.5TB' },
	{ value: '3000', label: '3TB' },
	{ value: '3500', label: '3.5TB' },
	{ value: '4000', label: '4TB' },
	{ value: '4500', label: '4.5TB' },
	{ value: '5000', label: '5TB' },
];

const NewClusterSchema = z.object({
	clusterName: z.string().min(1, 'Must be at least 1 character long.').max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z.string()
		.min(1, 'Must be at least 1 character long.')
		.max(20, 'Must be at most 20 characters long.')
		.regex(/^[a-zA-Z0-9-]+$/, 'Can only contain letters, numbers and dashes'),
	instanceTypes: z.string({
		required_error: 'Please select an instance type.',
	}),
	storage: z.string({
		required_error: 'Please select a storage size.',
	}),
	regions: z
		.array(
			z.object({
				region: z.string().nonempty('Region is required.'),
				cloudProvider: z.string().nonempty('Cloud Provider is required.'),
				count: z.number().min(0, 'Count must be non-negative.').min(1, 'Count must be at least 1.'),
			})
		)
		.optional(),
});

function NewClusterModal({ orgId }: { orgId: string }) {
	const queryClient = useQueryClient();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const form = useForm({
		resolver: zodResolver(NewClusterSchema),
		defaultValues: {
			clusterName: '',
			abbreviatedName: '',
			regions: [], // Initialize regions as an empty array
		},
	});
	const fieldArray = useFieldArray({
		control: form.control,
		name: 'regions', // This is the name of the field array
	});

	const { data: instanceTypes } = useQuery(getInstanceTypeOptions());
	const { data: regionLocations } = useQuery(getRegionLocationsOptions());
	const { mutate: submitNewClusterData } = useCreateNewClusterMutation();

	const selectedRegions = form.watch('regions');

	const submitForm = async (formData: { clusterName: string; abbreviatedName: string }) => {
		const updatedFormData = {
			organizationId: orgId,
			...formData,
		} as NewClusterInfo;
		submitNewClusterData(updatedFormData, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
				setIsModalOpen(false);
			},
		});
	};

	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogTrigger asChild>
				<Button variant="positive" className="w-full rounded-full md:w-44">
					<Plus /> New Cluster
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[625px]">
				<DialogHeader>
					<DialogTitle>Create a New Cluster</DialogTitle>
					<DialogDescription>Create a new cluster here.</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid grid-cols-1 gap-6 text-white md:grid-cols-6">
						<FormField
							control={form.control}
							name="clusterName"
							render={({ field }) => (
								<FormItem className="md:col-span-3">
									<FormLabel className="pb-1">Cluster Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="User Cluster" maxLength={255} {...field} className="" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="abbreviatedName"
							render={({ field }) => (
								<FormItem className="md:col-span-3">
									<FormLabel className="pb-1">Abbreviated Name</FormLabel>
									<FormControl>
										<Input type="text" placeholder="ex. cluster-1" maxLength={20} {...field} className="" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="instanceTypes"
							render={({ field }) => (
								<FormItem className="md:col-span-3">
									<FormLabel className="pb-1">Instance Type</FormLabel>
									<FormControl>
										<Select onValueChange={field.onChange} {...field}>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select Instance Type" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													{instanceTypes?.map((type) => (
														<SelectItem key={type.id} value={type.id}>
															{renderInstanceTypeOption(type.id as InstanceTypes)}
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
						{/* TODO: consolidate this with the storage size options in the NewInstanceModal */}
						<FormField
							control={form.control}
							name="storage"
							render={({ field }) => (
								<FormItem className="md:col-span-3">
									<FormLabel className="pb-1">Storage Size</FormLabel>
									<FormControl>
										<Select onValueChange={field.onChange} {...field}>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select Storage Size" />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectLabel>Storage Size</SelectLabel>
													{storageSizeOptions.map((option, index) => (
														<SelectItem key={index} value={option.value}>
															{option.label}
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
						<div className="p-4 overflow-y-auto rounded-md md:col-span-6 bg-accent h-36">
							{fieldArray.fields.length > 0 ? (
								fieldArray.fields.map((field, index) => (
									<RegionFormInputs
										key={field.id} // Use the unique id provided by fieldArray
										control={form.control}
										index={index}
										regionLocations={regionLocations || []}
										selectedRegions={selectedRegions || []}
										remove={() => {
											fieldArray.remove(index);
										}}
									/>
								))
							) : (
								<p>No regions added yet.</p>
							)}
						</div>
						<div className="md:col-span-6">
							<Button
								type="button"
								variant="positive"
								className="rounded-full"
								onClick={() => {
									fieldArray.append({ region: '', cloudProvider: '', count: 0 });
								}}
							>
								<PlusIcon />
								Add a Region
							</Button>
						</div>
						<DialogFooter className="md:col-span-6">
							<Button type="submit" variant="submit" className="rounded-full">
								Create New Cluster <ArrowRight />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

export default NewClusterModal;
