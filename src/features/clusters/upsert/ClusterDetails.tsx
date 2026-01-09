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
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ArrowRight } from 'lucide-react';
import { Suspense, useEffect, useMemo } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { ClusterRegions } from './ClusterRegions';
import { ClusterInstances } from './components/ClusterInstances';
import { UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterDetailsProps {
	calculatedNames: { suggestedAbbreviatedName: string; fullHostName: string };
	clusterId?: string;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	form: UseFormReturn<UpsertClusterSchemaType>;
	isPending: boolean;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedDeployment: string;
	selectedPerformance: string;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number;
	isEnterprise: boolean;
}

const DEPLOYMENT_FULL_DESCRIPTION: { [key: string]: string } = {
	'Colocated': 'Shared infrastructure for optimized value',
	'Dedicated': 'Dedicated infrastructure for consistent performance',
	'Self-Hosted': 'Your own infrastructure',
};

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
	isEnterprise,
}: ClusterDetailsProps) {
	const { isDirty, isValid } = useFormState();
	const availablePerformanceDescriptions = useMemo(() => {
		return Object.keys(deploymentToPerformanceToPlan[selectedDeployment] || {}).map(performanceTier => {
			const splitByParens = performanceTier.slice(0, -1).split('(');
			if (splitByParens.length > 1) {
				return {
					performanceTier,
					name: splitByParens[0],
					description: splitByParens[1],
				};
			}
			const splitByFor = performanceTier.split(' for ');
			if (splitByFor.length > 1) {
				return {
					performanceTier,
					name: splitByFor[0],
					description: 'For ' + splitByFor[1],
				};
			}
			return {
				performanceTier,
				name: performanceTier,
				description: '',
			};
		});
	}, [deploymentToPerformanceToPlan, selectedDeployment]);
	const availableDeploymentTypes = useMemo(() => Object.keys(deploymentToPerformanceToPlan).sort(), [
		deploymentToPerformanceToPlan,
	]);

	useEffect(function autoSelectFirstAvailablePerformanceDescription() {
		if (
			availablePerformanceDescriptions?.length
			&& !availablePerformanceDescriptions.find(sp => sp.performanceTier === selectedPerformance)
		) {
			form.setValue('performanceDescription', availablePerformanceDescriptions[0].performanceTier);
			void form.trigger();
		}
	}, [selectedDeployment, selectedPerformance, availablePerformanceDescriptions, form]);

	const isSelfManaged = selectedDeployment === 'Self-Hosted';

	return (
		<>
			<div className="grid grid-cols-3 gap-6 text-white md:grid-cols-6">
				<FormField
					control={form.control}
					name="clusterName"
					render={({ field }) => (
						<FormItem className="col-span-3 md:col-span-6">
							<FormLabel className="pb-1">Cluster Name</FormLabel>
							<FormControl>
								<Input
									autoFocus={true}
									type="text"
									maxLength={UpsertClusterSchema.shape.clusterName.maxLength!}
									autoCapitalize="words"
									disabled={!!clusterId}
									{...field}
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
										}}
									>
										<SelectTrigger className="w-full h-auto">
											<SelectValue placeholder="Choose Tier" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{availableDeploymentTypes.map((deploymentDescription) => (
													<SelectItem
														key={deploymentDescription}
														value={deploymentDescription}
													>
														<dt className="text-left font-bold text-sm/6">{deploymentDescription}</dt>
														{DEPLOYMENT_FULL_DESCRIPTION[deploymentDescription] && (
															<dd className="font-light">{DEPLOYMENT_FULL_DESCRIPTION[deploymentDescription]}</dd>
														)}
													</SelectItem>
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
							<FormLabel className="pb-1">
								{selectedDeployment.startsWith('Self') ? 'Support' : 'Performance'} &amp; Usage
							</FormLabel>

							<Suspense fallback={<TextLoadingSkeleton />}>
								<FormControl>
									<Select
										{...field}
										onValueChange={(performanceDescription) => {
											field.onChange(performanceDescription);
											void form.trigger();
										}}
										disabled={!availablePerformanceDescriptions?.length}
									>
										<SelectTrigger className="w-full h-auto">
											<SelectValue placeholder="Choose Tier" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{availablePerformanceDescriptions.map((performanceDescription) => (
													<SelectItem
														key={performanceDescription.name}
														value={performanceDescription.performanceTier}
													>
														<dt className="text-left font-bold text-sm/6">{performanceDescription.name}</dt>
														{performanceDescription.description && (
															<dd className="font-light">{performanceDescription.description}</dd>
														)}
													</SelectItem>
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
					? (
						<>
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
						</>
					)
					: (
						<>
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
												maxLength={UpsertClusterSchema.shape.abbreviatedName.unwrap().maxLength!}
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
						</>
					)}

				{isSelfManaged
					? <ClusterInstances form={form} />
					: (
						<ClusterRegions
							form={form}
							regionLocations={regionLocations}
							regionNameToLatencyToRegion={regionNameToLatencyToRegion}
							selectedPlan={selectedPlan}
							totalPrice={totalPrice}
							isEnterprise={isEnterprise}
						/>
					)}
			</div>
			<DialogFooter className="mt-3 mb-12">
				<Button
					type="submit"
					variant="submit"
					className="rounded-full"
					disabled={isPending || (clusterId && !isDirty) || !isValid}
				>
					{totalPrice > 0 ? 'Confirm Payment Details' : clusterId ? 'Edit Cluster' : 'Create New Cluster'}
					<ArrowRight />
				</Button>
			</DialogFooter>
		</>
	);
}
