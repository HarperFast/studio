import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { DialogFooter } from '@/components/ui/dialog';
import { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { ClusterAbbreviatedName } from '@/features/clusters/upsert/fields/ClusterAbbreviatedName';
import { ClusterDeploymentDescription } from '@/features/clusters/upsert/fields/ClusterDeploymentDescription';
import { ClusterFQDN } from '@/features/clusters/upsert/fields/ClusterFQDN';
import { ClusterName } from '@/features/clusters/upsert/fields/ClusterName';
import { ClusterPerformanceDescription } from '@/features/clusters/upsert/fields/ClusterPerformanceDescription';
import { ClusterSkipGtmWait } from '@/features/clusters/upsert/fields/ClusterSkipGtmWait';
import { ClusterVersion } from '@/features/clusters/upsert/fields/ClusterVersion';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ArrowRight, Layers3, Server } from 'lucide-react';
import { ReactNode, useEffect, useMemo } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { ClusterRegions } from './ClusterRegions';
import { ClusterInstances } from './components/ClusterInstances';
import { calculatePremiumOnlyRegions } from './lib/calculatePremiumOnlyRegions';
import { calculateUsageScale } from './lib/calculateUsageScale';
import { PartialUpgrade } from './lib/detectPartialUpgrade';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterDetailsProps {
	priceSummary?: ReactNode;
	calculatedNames: { suggestedAbbreviatedName: string; fullHostName: string };
	clusterId?: string;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	form: UseFormReturn<UpsertClusterSchemaType>;
	harperVersions: HarperVersionsResponse | undefined;
	isEnterprise: boolean;
	cloudProvider: keyof SchemaCloudInstanceTypes | undefined;
	isPending: boolean;
	mode: 'version' | undefined;
	partialUpgrade: PartialUpgrade | null;
	regionLocations: SchemaRegion[] | undefined;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	selectedDeployment: string;
	selectedPerformance: string;
	selectedPlan: SchemaPlan | undefined;
	totalPrice: number;
}

export function ClusterDetails({
	priceSummary,
	calculatedNames,
	clusterId,
	deploymentToPerformanceToPlan,
	form,
	harperVersions,
	isEnterprise,
	cloudProvider,
	isPending,
	mode,
	partialUpgrade,
	regionLocations,
	regionNameToLatencyToRegion,
	selectedDeployment,
	selectedPerformance,
	selectedPlan,
	totalPrice,
}: ClusterDetailsProps) {
	const { isDirty, isValid } = useFormState();
	const availablePerformanceDescriptions = useMemo(() => {
		const plansByTier = deploymentToPerformanceToPlan[selectedDeployment] || {};
		const planLevels = Object.values(plansByTier).map(plan => plan.planLevel ?? 0);
		const minPlanLevel = planLevels.length ? Math.min(...planLevels) : 0;
		return Object.keys(plansByTier).map(performanceTier => {
			const isPremium = (plansByTier[performanceTier].planLevel ?? 0) > minPlanLevel;
			const splitByParens = performanceTier.slice(0, -1).split('(');
			if (splitByParens.length > 1) {
				return {
					performanceTier,
					name: splitByParens[0],
					description: splitByParens[1],
					isPremium,
				};
			}
			const splitByFor = performanceTier.split(' for ');
			if (splitByFor.length > 1) {
				return {
					performanceTier,
					name: splitByFor[0],
					description: 'For ' + splitByFor[1],
					isPremium,
				};
			}
			return {
				performanceTier,
				name: performanceTier,
				description: '',
				isPremium,
			};
		});
	}, [deploymentToPerformanceToPlan, selectedDeployment]);
	const availableDeploymentTypes = useMemo(() => Object.keys(deploymentToPerformanceToPlan).sort(), [
		deploymentToPerformanceToPlan,
	]);
	const premiumOnlyRegions = useMemo(
		() =>
			calculatePremiumOnlyRegions(
				Object.values(deploymentToPerformanceToPlan[selectedDeployment] || {}),
				regionNameToLatencyToRegion,
			),
		[deploymentToPerformanceToPlan, regionNameToLatencyToRegion, selectedDeployment],
	);
	const usageScale = useMemo(
		() =>
			calculateUsageScale(
				Object.values(deploymentToPerformanceToPlan).flatMap(performanceToPlan => Object.values(performanceToPlan)),
				regionNameToLatencyToRegion,
			),
		[deploymentToPerformanceToPlan, regionNameToLatencyToRegion],
	);

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

	// On a partially-upgraded cluster the version is already pre-selected to the latest, so the form
	// never goes dirty — allow re-submitting it anyway so the lagging instances can be retried.
	const allowVersionResubmit = mode === 'version' && !!partialUpgrade;

	const footer = (
		<DialogFooter className="mt-6 mb-8 border-t border-border/60 pt-6">
			<Button
				className="w-full sm:w-auto"
				type="submit"
				variant="submit"
				disabled={isPending || (clusterId && !isDirty && !allowVersionResubmit) || !isValid}
			>
				{mode !== 'version' && totalPrice > 0
					? 'Confirm Payment Details'
					: clusterId
					? 'Edit Cluster'
					: 'Create New Cluster'}
				<ArrowRight />
			</Button>
		</DialogFooter>
	);

	if (mode === 'version') {
		return (
			<>
				<Card className="min-w-0 gap-0 overflow-hidden py-0">
					<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/15 py-5 dark:from-primary/15 dark:to-primary/5">
						<h2 className="flex items-center gap-2 text-base font-semibold">
							<Server className="size-4 text-primary" aria-hidden="true" />Cluster details
						</h2>
						<CardDescription>
							Choose the Harper version for your cluster.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid min-w-0 grid-cols-3 items-start gap-6 py-6 text-foreground md:grid-cols-6">
						<ClusterName
							className={harperVersions?.value?.length ? 'col-span-3' : 'md:col-span-6 col-span-3'}
							disabled={true}
							form={form}
						/>
						<ClusterVersion
							className="col-span-3"
							form={form}
							harperVersions={harperVersions}
						/>
						<ClusterSkipGtmWait className="col-span-3 md:col-span-6" form={form} />
						{partialUpgrade && (
							<p className="col-span-3 md:col-span-6 max-w-prose text-xs font-light text-amber-600 dark:text-amber-400">
								{partialUpgrade.behindCount} of {partialUpgrade.total} instances{' '}
								{partialUpgrade.behindCount === 1 ? 'is' : 'are'} still on an older version. Re-run the upgrade to bring
								{' '}
								{partialUpgrade.behindCount === 1 ? 'it' : 'them'} up to {partialUpgrade.latest}.
							</p>
						)}
					</CardContent>
				</Card>
				{footer}
			</>
		);
	}

	return (
		<>
			<div className={priceSummary ? 'grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]' : ''}>
				<div className="min-w-0 space-y-6">
					<Card className="min-w-0 gap-0 overflow-hidden py-0">
						<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/15 py-5 dark:from-primary/15 dark:to-primary/5">
							<h2 className="flex items-center gap-2 text-base font-semibold">
								<Server className="size-4 text-primary" aria-hidden="true" />Cluster details
							</h2>
							<CardDescription>
								Your cluster’s identity, version, and address.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid min-w-0 grid-cols-3 items-start gap-6 py-6 text-foreground md:grid-cols-6">
							<ClusterName
								className={harperVersions?.value?.length ? 'col-span-3' : 'md:col-span-6 col-span-3'}
								disabled={!!clusterId}
								form={form}
							/>
							<ClusterVersion
								className="col-span-3"
								disabled={!!clusterId}
								form={form}
								harperVersions={harperVersions}
							/>

							{isSelfManaged
								? <ClusterFQDN form={form} disabled={!!clusterId} />
								: <ClusterAbbreviatedName form={form} calculatedNames={calculatedNames} disabled={!!clusterId} />}
						</CardContent>
					</Card>
					<Card className="min-w-0 gap-0 overflow-hidden py-0">
						<CardHeader className="border-b border-primary/10 bg-linear-to-br from-primary/5 to-primary/15 py-5 dark:from-primary/15 dark:to-primary/5">
							<h2 className="flex items-center gap-2 text-base font-semibold">
								<Layers3 className="size-4 text-primary" aria-hidden="true" />Deployment &amp; capacity
							</h2>
							<CardDescription>Choose your infrastructure and the capacity your workload needs.</CardDescription>
						</CardHeader>
						<CardContent className="grid min-w-0 grid-cols-3 items-start gap-6 py-6 text-foreground md:grid-cols-6">
							<ClusterDeploymentDescription form={form} availableDeploymentTypes={availableDeploymentTypes} />

							<ClusterPerformanceDescription
								availablePerformanceDescriptions={availablePerformanceDescriptions}
								form={form}
								selectedDeployment={selectedDeployment}
							/>

							{isSelfManaged
								? <ClusterInstances form={form} />
								: (
									<ClusterRegions
										form={form}
										regionLocations={regionLocations}
										regionNameToLatencyToRegion={regionNameToLatencyToRegion}
										premiumOnlyRegions={premiumOnlyRegions}
										usageScale={usageScale}
										selectedPlan={selectedPlan}
										totalPrice={totalPrice}
										isEnterprise={isEnterprise}
										cloudProvider={cloudProvider}
									/>
								)}
							{clusterId && !isSelfManaged && <ClusterSkipGtmWait className="col-span-3 md:col-span-6" form={form} />}
						</CardContent>
					</Card>
				</div>
				{priceSummary}
			</div>
			{footer}
		</>
	);
}
