import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { RegionFormInputs } from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { SchemaCluster } from '@/lib/api.gen';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, PlusIcon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

export const NewClusterSchema = z.object({
	name: z.string().min(1, 'Must be at least 1 character long.').max(255, 'Must be at most 255 characters long.'),
	abbreviatedName: z
		.string()
		.min(1, 'Must be at least 1 character long.')
		.max(20, 'Must be at most 20 characters long.')
		.regex(/^[a-zA-Z0-9-]+$/, 'Can only contain letters, numbers and dashes'),
	regionPlans: z.array(
		z.object({
			regionId: z.string().nonempty('Region is required.'),
			planId: z.string().nonempty('Plan Type is required.'),
			count: z.number().min(0, 'Count must be non-negative.').min(1, 'Count must be at least 1.'),
			price: z.string(),
		})
	),
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
			name: '',
			abbreviatedName: '',
			regionPlans: [], // Initialize regions as an empty array
		},
	});
	const fieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans', // This is the name of the field array
	});

	const { data: planTypes } = useQuery(getPlanTypesOptions());
	const { data: regionLocations } = useQuery(getRegionLocationsOptions());
	const { mutate: submitNewClusterData } = useCreateNewClusterMutation();

	const selectedRegions = form.watch('regionPlans');

	// NOTE: Don't like how this is done, but works. Would like to find a better way to calculate the total price of selected regions.
	const totalPriceNumber =
		selectedRegions?.reduce((acc, region) => {
			const price = region.price ? Number(region.price) : 0;
			return acc + price;
		}, 0) ?? 0;
	const totalPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceNumber);

	const submitForm = async (formData: z.infer<typeof NewClusterSchema>) => {
		const updatedFormData: Omit<SchemaCluster, 'id'> = {
			organizationId: orgId,
			...formData,
		};
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
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(submitForm)} className="grid grid-cols-1 gap-6 text-white md:grid-cols-6">
						<FormField
							control={form.control}
							name="name"
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
										<Input type="text" placeholder="user-cluster" maxLength={20} {...field} className="" />
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
										// @ts-expect-error come back to this later
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
									fieldArray.append({ regionId: '', planId: '', count: 0, price: '' });
								}}
							>
								<PlusIcon />
								Add a Region
							</Button>
						</div>
						<div className="md:col-span-6">
							<p>Total Price: {totalPrice}</p>
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
