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
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { RegionFormInputs } from '@/features/clusters/modals/NewClusterModal/components/RegionFormInputs';
import { ResourcesPerInstance } from '@/features/clusters/modals/NewClusterModal/components/ResourcesPerInstance';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { PriceDisplay } from '@/features/clusters/modals/NewClusterModal/PriceDisplay';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaRegionPlan } from '@/lib/api.gen';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { stringsShareAPrefix } from '@/lib/string/stringsShareAPrefix';
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
	const { data: planTypes } = useQuery(getPlanTypesOptions());
	const { data: regionLocations } = useQuery(getRegionLocationsOptions());
	const { mutate: submitNewClusterData, isPending } = useCreateNewClusterMutation();

	const deploymentToPerformanceToPlan = useMemo(() =>
		groupThenKeyBy(planTypes || [], 'deploymentDescription', 'performanceDescription'), [planTypes]);
	const availableDeploymentTypes = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan).sort((a, b) => {
			const aPrice = Object.values(deploymentToPerformanceToPlan[a])[0].priceUsd ?? 0;
			const bPrice = Object.values(deploymentToPerformanceToPlan[b])[0].priceUsd ?? 0;
			return aPrice - bPrice;
		}), [deploymentToPerformanceToPlan]);
	const regionNameToLatencyToRegion = useMemo(() =>
		groupThenKeyBy(regionLocations || [], 'region', 'latencyDescription'), [regionLocations]);

	const refineZod = useCallback((data: z.infer<typeof NewClusterSchema>, ctx: z.RefinementCtx) => {
		const names = new Set();
		const selectedPlan = deploymentToPerformanceToPlan?.[data.deploymentDescription]?.[data.performanceDescription];
		for (let i = 0; i < data.regionPlans.length; i++) {
			const regionPlan = data.regionPlans[i];
			const region = regionNameToLatencyToRegion[regionPlan.regionName]?.[regionPlan.latencyDescription];
			if (!names.has(regionPlan.regionName)) {
				names.add(regionPlan.regionName);
			} else {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: [`regionPlans.${i}.regionName`],
					message: 'You can only select a region once!',
				});
			}
			if (selectedPlan?.allowedRegionIds?.length && region?.id && !selectedPlan.allowedRegionIds.includes(region.id)) {
				const prefixMatches = stringsShareAPrefix(selectedPlan.allowedRegionIds, region.id);
				if (!prefixMatches) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: [`regionPlans.${i}.regionName`],
						message: `This region is not available with the ${data.deploymentDescription} tier!`,
					});
				} else {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: [`regionPlans.${i}.latencyDescription`],
						message: `This latency is not available with the ${data.deploymentDescription} tier!`,
					});
				}
			}
		}
	}, [deploymentToPerformanceToPlan, regionNameToLatencyToRegion]);

	const form = useForm({
		mode: 'onBlur',
		resolver: zodResolver(NewClusterSchema.superRefine(refineZod)),
		defaultValues: {
			systemName: '',
			abbreviatedName: '',
			// TODO: How do we look these up at the start with the live values from the API?
			deploymentDescription: 'Free',
			performanceDescription: 'Basic (1K read/min)',
			regionPlans: [
				{ regionName: 'Global', latencyDescription: 'Low distribution, 250ms latency' },
			],
		},
	});
	const fieldArray = useFieldArray({
		control: form.control,
		name: 'regionPlans',
	});

	const systemName = form.watch('systemName');
	const abbreviatedName = form.watch('abbreviatedName');
	const selectedDeployment = form.watch('deploymentDescription');
	const selectedPerformance = form.watch('performanceDescription');
	const selectedRegionPlans = form.watch('regionPlans');

	const calculatedNames = useMemo(() => {
		const suggestedAbbreviatedName = collapseKebabsToMaxLength(
			toKebabCase(systemName),
			NewClusterSchema.shape.abbreviatedName.maxLength!,
		);
		return {
			suggestedAbbreviatedName,
			fullHostName: `${abbreviatedName || suggestedAbbreviatedName}.${orgInfo?.subdomain || 'your-org'}.harperfabric.com`,
		};
	}, [systemName, abbreviatedName, orgInfo]);
	const availablePerformanceDescriptions = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan[selectedDeployment] || {}), [deploymentToPerformanceToPlan, selectedDeployment]);
	const selectedPlan = useMemo(() =>
		deploymentToPerformanceToPlan?.[selectedDeployment]?.[selectedPerformance], [deploymentToPerformanceToPlan, selectedDeployment, selectedPerformance]);

	useEffect(function autoSelectFirstAvailablePerformanceDescription() {
		if (availablePerformanceDescriptions?.length && !availablePerformanceDescriptions.includes(selectedPerformance)) {
			form.setValue('performanceDescription', availablePerformanceDescriptions[0]);
			form.trigger();
		}
	}, [selectedDeployment, selectedPerformance, availablePerformanceDescriptions, form]);
	useEffect(function autoSelectPlanAllowedRegionId() {
		const allowedRegionIds = selectedPlan?.allowedRegionIds;
		if (allowedRegionIds?.length && selectedRegionPlans?.length === 1) {
			const firstRegion = selectedRegionPlans[0];
			const firstSelectedRegion = regionNameToLatencyToRegion?.[firstRegion.regionName]?.[firstRegion.latencyDescription];
			if (!allowedRegionIds.includes(firstSelectedRegion?.id)) {
				const regionToSelect = regionLocations?.find(r => allowedRegionIds.includes(r.id));
				if (regionToSelect) {
					form.setValue('regionPlans.0.regionName', regionToSelect.region);
					form.setValue('regionPlans.0.latencyDescription', regionToSelect.latencyDescription);
					form.trigger();
				}
			}
		}
	}, [selectedPlan, selectedRegionPlans, form, regionNameToLatencyToRegion, regionLocations]);

	const totalPrice = !selectedPlan?.priceUsd
		? 0
		: selectedRegionPlans.reduce((total, region) => {
			const regionPlan = regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!];
			return total + (!regionPlan
				? 0
				: selectedPlan.priceUsd! * regionPlan.instanceCount / 2);
		}, 0);

	const onAddARegionClick = useCallback(() => {
		const selectedRegionNames = selectedRegionPlans.map(region => regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!]?.region);
		const firstRegionLocation = regionLocations?.find(r => !selectedRegionNames.includes(r.region));
		if (firstRegionLocation) {
			fieldArray.append({ regionName: firstRegionLocation.region, latencyDescription: firstRegionLocation.latencyDescription });
			form.trigger();
		}
	}, [fieldArray, form, regionLocations, regionNameToLatencyToRegion, selectedRegionPlans]);
	const onClusterCreatedCallback = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
		setIsModalOpen(false);
		form.reset();
	}, [form, queryClient, setIsModalOpen]);
	const submitForm = useCallback(async (formData: z.infer<typeof NewClusterSchema>) => {
		const plans: SchemaRegionPlan[] = [];
		const plan = deploymentToPerformanceToPlan[formData.deploymentDescription][formData.performanceDescription];
		for (const regionPlan of formData.regionPlans) {
			const region = regionNameToLatencyToRegion[regionPlan.regionName][regionPlan.latencyDescription];
			plans.push({
				planId: plan.id,
				regionId: region.id,
				autoRenew: true,
			});
		}
		submitNewClusterData({
			organizationId: orgId,
			name: formData.systemName,
			abbreviatedName: formData.abbreviatedName || calculatedNames.suggestedAbbreviatedName,
			autoRenew: true,
			regionPlans: plans,
		}, { onSuccess: onClusterCreatedCallback });
	}, [calculatedNames.suggestedAbbreviatedName, deploymentToPerformanceToPlan, onClusterCreatedCallback, orgId, regionNameToLatencyToRegion, submitNewClusterData]);

	// TODO: Make this slightly more generic so we can use it for editing, as well.
	return (
		<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
			<DialogContent className="sm:max-w-[825px]">
				<DialogHeader>
					<DialogTitle>Cluster Configuration</DialogTitle>
					<DialogDescription>Configure your Harper system and define deployment plans.</DialogDescription>

					<div className="absolute top-6 right-12 text-right">
						<dt className="font-light">Total Price</dt>
						<dd className="font-bold"><PriceDisplay price={totalPrice} /></dd>
					</div>
				</DialogHeader>
				<Form {...form}>
					<DialogTitle>System</DialogTitle>
					<form onSubmit={form.handleSubmit(submitForm)}>
						<div className="grid grid-cols-3 gap-6 text-white md:grid-cols-6 overflow-auto max-h-[calc(100vh-theme(spacing.52))]">
							<FormField
								control={form.control}
								name="systemName"
								render={({ field }) => (
									<FormItem className="col-span-3 md:col-span-6">
										<FormLabel className="pb-1">Harper System Name</FormLabel>
										<FormControl>
											<Input
												type="text"
												maxLength={NewClusterSchema.shape.systemName.maxLength!}
												autoCapitalize="words"
												{...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="abbreviatedName"
								render={({ field }) => (
									<FormItem className="col-span-3">
										<FormLabel className="pb-1">Host Name</FormLabel>
										<FormControl>
											<Input
												type="text"
												maxLength={NewClusterSchema.shape.abbreviatedName.maxLength!}
												autoCapitalize="none"
												placeholder={calculatedNames.suggestedAbbreviatedName}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormItem className="col-span-3 ">
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
									<FormItem className="col-span-3">
										<FormLabel className="pb-1">Harper Deployment</FormLabel>

										<Suspense fallback={<TextLoadingSkeleton />}>
											<FormControl>
												<Select {...field} onValueChange={(deploymentDescription) => {
													field.onChange(deploymentDescription);
													form.trigger();
												}}>
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
									<FormItem className="col-span-3">
										<FormLabel className="pb-1">Performance &amp; Usage</FormLabel>

										<Suspense fallback={<TextLoadingSkeleton />}>
											<FormControl>
												<Select {...field} onValueChange={(performanceDescription) => {
													field.onChange(performanceDescription);
													form.trigger();
												}}
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

							{selectedPlan?.resourcesPerInstance && (
								<ResourcesPerInstance resourcesPerInstance={selectedPlan.resourcesPerInstance} />
							)}

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

							<div className="md:col-span-6 col-span-3">
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
						<DialogFooter className="mt-3">
							<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
								Create New Cluster <ArrowRight />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
