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
import { ClusterRegions } from '@/features/clusters/modals/NewClusterModal/ClusterRegions';
import { ResourcesPerInstance } from '@/features/clusters/modals/NewClusterModal/components/ResourcesPerInstance';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { ArrowRight } from 'lucide-react';
import { Suspense, useEffect, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

interface ClusterDetailsProps {
	calculatedNames: { suggestedAbbreviatedName: string; fullHostName: string };
	form: UseFormReturn<z.infer<typeof NewClusterSchema>>;
	isPending: boolean;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	selectedDeployment: string;
	selectedPerformance: string;
}

export function ClusterDetails({
	calculatedNames,
	form,
	isPending,
	regionLocations,
	regionNameToLatencyToRegion,
	selectedPlan,
	totalPrice,
	deploymentToPerformanceToPlan,
	selectedDeployment,
	selectedPerformance,
}: ClusterDetailsProps) {
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

	// const isSelfManaged = selectedDeployment === 'Manage Your Own Installation/Configuration';

	return (<>
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
						<FormLabel className="pb-1">Performance &amp; Usage</FormLabel>

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

			{selectedPlan?.resourcesPerInstance && (
				<ResourcesPerInstance resourcesPerInstance={selectedPlan.resourcesPerInstance} />
			)}

			<ClusterRegions
				form={form}
				regionLocations={regionLocations}
				regionNameToLatencyToRegion={regionNameToLatencyToRegion}
				selectedPlan={selectedPlan}
			/>
		</div>
		<DialogFooter className="mt-3">
			<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
				{totalPrice > 0 ? 'Confirm Payment Details' : 'Create New Cluster'} <ArrowRight />
			</Button>
		</DialogFooter>
	</>);
}
