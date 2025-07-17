import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { RegionFormInputs } from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { ResourcesPerInstance } from '@/features/clusters/modals/NewClusterModal/components/ResourcesPerInstance';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { tempPlansMock } from '@/features/clusters/modals/NewClusterModal/tempPlans';
import { tempRegionsMock } from '@/features/clusters/modals/NewClusterModal/tempRegions';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaCluster } from '@/lib/api.gen';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, PlusIcon } from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

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
	const { data: orgInfo } = useQuery(getOrganizationQueryOptions(orgId));
	const planTypes = tempPlansMock;
	// TODO: Once we're done mocking: const { data: planTypes } = useQuery(getPlanTypesOptions());
	const regionLocations = tempRegionsMock;
	// TODO: Once we're done mocking: const { data: regionLocations } = useQuery(getRegionLocationsOptions());
	const { mutate: submitNewClusterData } = useCreateNewClusterMutation();

	const form = useForm({
		resolver: zodResolver(NewClusterSchema),
		defaultValues: {
			name: '',
			abbreviatedName: '',
			deploymentDescription: 'Free',
			regionPlans: [
				{ regionName: 'US', latencyDescription: '' },
			],
		},
	});
	const fieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const name = form.watch('name');
	const abbreviatedName = form.watch('abbreviatedName');
	const selectedDeployment = form.watch('deploymentDescription');
	const selectedPerformance = form.watch('performanceDescription');
	const selectedRegions = form.watch('regionPlans');

	const calculatedNames = useMemo(() => {
		const suggestedAbbreviatedName = collapseKebabsToMaxLength(
			toKebabCase(name),
			NewClusterSchema.shape.abbreviatedName.maxLength!,
		) || 'your-host-name';
		return {
			suggestedAbbreviatedName,
			fullHostName: `${abbreviatedName || suggestedAbbreviatedName}.${orgInfo?.subdomain || 'your-org'}.harperfabric.com`,
		};
	}, [name, abbreviatedName, orgInfo]);
	const deploymentToPerformanceToPlan = useMemo(() =>
		groupThenKeyBy(planTypes, 'deploymentDescription', 'performanceDescription'), [planTypes]);
	const availableDeploymentTypes = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan), [deploymentToPerformanceToPlan]);
	const availablePerformanceDescriptions = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan[selectedDeployment] || {}), [deploymentToPerformanceToPlan, selectedDeployment]);
	const selectedPlan = useMemo(() =>
		deploymentToPerformanceToPlan?.[selectedDeployment]?.[selectedPerformance], [deploymentToPerformanceToPlan, selectedDeployment, selectedPerformance]);
	const regionNameToLatencyToRegion = useMemo(() =>
		groupThenKeyBy(regionLocations, 'region', 'latencyDescription'), [regionLocations]);

	useEffect(function selectFirstAvailablePerformanceDescription() {
		if (availablePerformanceDescriptions?.length && !availablePerformanceDescriptions.includes(selectedPerformance)) {
			form.setValue('performanceDescription', availablePerformanceDescriptions[0]);
		}
	}, [selectedDeployment, selectedPerformance, availablePerformanceDescriptions, form]);
	useEffect(function enforcePlanAllowedRegionIds() {
		const allowedRegionIds = selectedPlan?.allowedRegionIds;
		if (allowedRegionIds?.length && selectedRegions?.length === 1) {
			const firstRegion = selectedRegions[0];
			const firstSelectedRegion = regionNameToLatencyToRegion?.[firstRegion.regionName]?.[firstRegion.latencyDescription];
			if (!allowedRegionIds.includes(firstSelectedRegion?.id)) {
				const regionToSelect = regionLocations.find(r => allowedRegionIds.includes(r.id));
				if (regionToSelect) {
					form.setValue('regionPlans.0.regionName', regionToSelect.region);
					form.setValue('regionPlans.0.latencyDescription', regionToSelect.latencyDescription);
				}
			}
		}
	}, [selectedPlan, selectedRegions, form, regionNameToLatencyToRegion, regionLocations]);


	// NOTE: Don't like how this is done, but works. Would like to find a better way to calculate the total price of selected regions.
	// const totalPriceNumber =
	// 	selectedRegions?.reduce((acc, region) => {
	// 		const price = region.price ? Number(region.price) : 0;
	// 		return acc + price;
	// 	}, 0) ?? 0;
	// const totalPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPriceNumber);

	const onAddARegionClick = useCallback(() => {
		fieldArray.append({ regionName: 'US', latencyDescription: '' });
	}, [fieldArray]);
	const submitForm = useCallback(async (formData: z.infer<typeof NewClusterSchema>) => {
		const updatedFormData: Omit<SchemaCluster, 'id'> = {
			organizationId: orgId,
			...formData,
		};
		if (!updatedFormData.abbreviatedName) {
			updatedFormData.abbreviatedName = calculatedNames.suggestedAbbreviatedName;
		}
		submitNewClusterData(updatedFormData, {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
				setIsModalOpen(false);
			},
		});
	}, [calculatedNames.suggestedAbbreviatedName, orgId, queryClient, setIsModalOpen, submitNewClusterData]);

	// TODO: "allowedRegionIds" validation.
	// TODO: Region uniqueness validation.
	// TODO: Selecting "Free" should have form validation so they won't change to other values without seeing an error.

	// TODO: Make this slightly more generic so we can use it for editing, as well.
	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogContent className="sm:max-w-[825px]">
				<DialogHeader>
					<DialogTitle>Cluster Configuration</DialogTitle>
					<DialogDescription>Configure your Harper system and define deployment plans.</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<DialogTitle>System</DialogTitle>
					<form onSubmit={form.handleSubmit(submitForm)}>
						<div className="grid grid-cols-3 gap-6 text-white md:grid-cols-6 overflow-auto max-h-[calc(100vh-theme(spacing.52))]">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem className="md:col-span-6">
										<FormLabel className="pb-1">Harper System Name</FormLabel>
										<FormControl>
											<Input type="text" maxLength={NewClusterSchema.shape.name.maxLength!} autoCapitalize="words" {...field} />
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
										<FormLabel className="pb-1">Host Name</FormLabel>
										<FormControl>
											<Input type="text" maxLength={NewClusterSchema.shape.abbreviatedName.maxLength!} {...field} autoCapitalize="none" placeholder={calculatedNames.suggestedAbbreviatedName} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormItem className="md:col-span-3">
								<FormLabel className="pb-1">Full Host Name</FormLabel>
								<FormControl>
									<span>{calculatedNames.fullHostName}</span>
								</FormControl>
								<FormMessage />
							</FormItem>

							<FormField
								control={form.control}
								name="deploymentDescription"
								render={({ field }) => (
									<FormItem className="md:col-span-3">
										<FormLabel className="pb-1">Harper Deployment</FormLabel>

										<Suspense fallback={<TextLoadingSkeleton />}>
											<FormControl>
												<Select {...field} onValueChange={(deploymentDescription) => field.onChange(deploymentDescription)}>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Choose Tier" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{availableDeploymentTypes.map((deploymentDescription) => (
																<SelectItem
																	key={deploymentDescription}
																	value={deploymentDescription}
																>{deploymentDescription}</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											</FormControl>
										</Suspense>

										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="performanceDescription"
								render={({ field }) => (
									<FormItem className="md:col-span-3">
										<FormLabel className="pb-1">Performance &amp; Usage</FormLabel>

										<Suspense fallback={<TextLoadingSkeleton />}>
											<FormControl>
												<Select {...field} onValueChange={(performanceDescription) => field.onChange(performanceDescription)}
													disabled={!availablePerformanceDescriptions?.length}>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Choose Tier" />
													</SelectTrigger>
													<SelectContent>
														<SelectGroup>
															{availablePerformanceDescriptions.map((performanceDescription) => (
																<SelectItem
																	key={performanceDescription}
																	value={performanceDescription}
																>{performanceDescription}</SelectItem>
															))}
														</SelectGroup>
													</SelectContent>
												</Select>
											</FormControl>
										</Suspense>

										<FormMessage />
									</FormItem>
								)}
							/>

							{selectedPlan?.resourcesPerInstance
								&& <ResourcesPerInstance resourcesPerInstance={selectedPlan.resourcesPerInstance} />}

							{fieldArray.fields.map((field, index) => (
								<RegionFormInputs
									control={form.control}
									fieldArray={fieldArray}
									form={form}
									index={index}
									key={field.id}
									regionNameToLatencyToRegion={regionNameToLatencyToRegion}
									selectedPlan={selectedPlan}
								/>
							))}

							<div className="md:col-span-6">
								<Button
									type="button"
									variant="positiveOutline"
									className="rounded-full"
									onClick={onAddARegionClick}
								>
									<PlusIcon />
									Add Additional Region Usage
								</Button>
							</div>

						</div>
						{/*<div className="md:col-span-6">*/}
						{/*	<p>Total Price: {totalPrice}</p>*/}
						{/*</div>*/}
						<DialogFooter className="mt-3">
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
