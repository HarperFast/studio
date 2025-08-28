import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClusterRegions } from '@/features/clusters/upsert/ClusterRegions';
import { ClusterInstances } from '@/features/clusters/upsert/components/ClusterInstances';
import { ResourcesPerInstance } from '@/features/clusters/upsert/components/ResourcesPerInstance';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { ArrowRight } from 'lucide-react';
import { Suspense, useEffect, useMemo } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { z } from 'zod';

interface ClusterDetailsProps {
	calculatedNames: { suggestedAbbreviatedName: string; fullHostName: string };
	clusterId?: string;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	isPending: boolean;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedDeployment: string;
	selectedPerformance: string;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number;
}

export function ClusterDetails({
	calculatedNames,
	clusterId,
	deploymentToPerformanceToPlan,
	form,
	isPending,
	regionLocations,
	regionNameToLatencyToRegion,
	selectedDeployment,
	selectedPerformance,
	selectedPlan,
	totalPrice,
}: ClusterDetailsProps) {
	const { isDirty, isValid } = useFormState();
	const availablePerformanceDescriptions = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan[selectedDeployment] || {}), [deploymentToPerformanceToPlan, selectedDeployment]);
	const availableDeploymentTypes = useMemo(() =>
		Object.keys(deploymentToPerformanceToPlan).sort((a, b) => {
			const aPrice = Object.values(deploymentToPerformanceToPlan[a])[0].priceUsd ?? 0;
			const bPrice = Object.values(deploymentToPerformanceToPlan[b])[0].priceUsd ?? 0;
			return aPrice - bPrice;
		}), [deploymentToPerformanceToPlan]);

	useEffect(function autoSelectFirstAvailablePerformanceDescription() {
		if (availablePerformanceDescriptions?.length && !availablePerformanceDescriptions.includes(selectedPerformance)) {
			form.setValue('performanceDescription', availablePerformanceDescriptions[0]);
			void form.trigger();
		}
	}, [selectedDeployment, selectedPerformance, availablePerformanceDescriptions, form]);

	const isSelfManaged = selectedDeployment === 'Manage Your Own Installation/Configuration';

	return (<>
		<div className="grid grid-cols-3 gap-6 text-white md:grid-cols-6 overflow-auto max-h-[calc(100vh-theme(spacing.52))]">
			<FormField
				control={form.control}
				name="systemName"
				render={({ field }) => (
					<FormItem className="col-span-3">
						<FormLabel className="pb-1">Harper System Name</FormLabel>
						<FormControl>
							<Input
								type="text"
								maxLength={UpsertClusterSchema.shape.systemName.maxLength!}
								autoCapitalize="words"
								disabled={!!clusterId}
								{...field} />
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name="autoRenew"
				render={({ field }) => (
					<FormItem className="col-span-3">
						<FormLabel className="pb-1">Auto Renew</FormLabel>
						<FormControl>
							<Input
								{...field}
								value={field.value as unknown as string}
								checked={field.value === true}
								type="checkbox"
								disabled={!!clusterId}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<FormField
				control={form.control}
				name="deploymentDescription"
				render={({ field }) => (
					<FormItem className="col-span-3">
						<FormLabel className="pb-1">Harper Deployment</FormLabel>

						<Suspense fallback={<TextLoadingSkeleton />}>
							<FormControl>
								<Select
									{...field}
									disabled={!!clusterId}
									onValueChange={(deploymentDescription) => {
										field.onChange(deploymentDescription);
										void form.trigger();
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
						<FormLabel className="pb-1">{selectedDeployment.startsWith('Self') ? 'Support' : 'Performance'} &amp; Usage</FormLabel>

						<Suspense fallback={<TextLoadingSkeleton />}>
							<FormControl>
								<Select {...field} onValueChange={(performanceDescription) => {
									field.onChange(performanceDescription);
									void form.trigger();
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

			{isSelfManaged
				? (<>
					<FormField
						control={form.control}
						name="fqdn"
						render={({ field }) => (
							<FormItem className="md:col-span-6 col-span-3">
								<FormLabel className="pb-1">Optional Cluster Load Balancer Host Name</FormLabel>
								<FormControl>
									<Input
										{...field}
										type="text"
										autoCapitalize="none"
										autoComplete="off"
										autoCorrect="off"
										placeholder="example.your-company.com"
										disabled={!!clusterId}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</>)
				: (<>
					<FormField
						control={form.control}
						name="abbreviatedName"
						render={({ field }) => (
							<FormItem className="col-span-3">
								<FormLabel className="pb-1">Host Name</FormLabel>
								<FormControl>
									<Input
										{...field}
										type="text"
										maxLength={UpsertClusterSchema.shape.abbreviatedName.maxLength!}
										autoCapitalize="none"
										autoComplete="off"
										autoCorrect="off"
										placeholder={calculatedNames.suggestedAbbreviatedName}
										disabled={!!clusterId}
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
				</>)
			}

			{isSelfManaged
				? (<ClusterInstances form={form} />)
				: (<ClusterRegions
					form={form}
					regionLocations={regionLocations}
					regionNameToLatencyToRegion={regionNameToLatencyToRegion}
					selectedPlan={selectedPlan}
				/>)
			}

			{selectedPlan?.planLimits?.totalReadCount! > 0 ? (
				<ResourcesPerInstance planLimits={selectedPlan.planLimits} resourcesPerInstance={selectedPlan.resourcesPerInstance!} />
			) : 'This plan has no usage limits'}
		</div>
		<DialogFooter className="mt-3">
			<Button type="submit" variant="submit" className="rounded-full" disabled={isPending || !isDirty || !isValid}>
				{totalPrice > 0 ? 'Confirm Payment Details' : clusterId ? 'Edit Cluster' : 'Create New Cluster'}
				<ArrowRight />
			</Button>
		</DialogFooter>
	</>);
}
