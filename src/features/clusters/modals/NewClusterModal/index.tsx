import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, PlusIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { NewClusterInfo, useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
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
import { getPlanTypesOptions } from '@/features/cluster/queries/getInstanceTypeQuery';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { Input } from '@/components/ui/input';
import { RegionFormInputs } from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { InstanceTypes, renderInstanceTypeOption } from '@/shared/functions/InstanceType';
import { RadioGroup } from '@/components/ui/radio-group';
import { RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { InstanceTypeCard } from './components/InstanceTypeCard';

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
	regionList: z.string({
		required_error: 'Please select a region.',
	}),
	planTypes: z.string({
		required_error: 'Please select a plan type.',
	}),
	clusterName: z.string().min(1, 'Must be at least 1 character long.').max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z
		.string()
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
				planType: z.string().nonempty('Plan Type is required.'),
				count: z.number().min(0, 'Count must be non-negative.').min(1, 'Count must be at least 1.'),
				price: z.string().optional(),
			})
		)
		.optional(),
});

export function NewClusterModal({
	orgId,
	isModalOpen,
	setIsModalOpen,
}: {
	orgId: string;
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
}) {
	const queryClient = useQueryClient();
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

	const { data: planTypes } = useQuery(getPlanTypesOptions());
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
			<DialogContent className="sm:max-w-[825px]">
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

						<div className="p-4 overflow-y-auto rounded-md md:col-span-6 bg-accent min-h-32 max-h-70">
							{fieldArray.fields.length > 0 ? (
								fieldArray.fields.map((field, index) => (
									<RegionFormInputs
										key={field.id} // Use the unique id provided by fieldArray
										control={form.control}
										index={index}
										regionLocations={regionLocations || []}
										planTypes={planTypes || []}
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
