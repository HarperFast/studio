import { Button } from '@/components/ui/button';
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
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { ClusterRegions } from './ClusterRegions';
import { ClusterInstances } from './components/ClusterInstances';
import { calculatePremiumOnlyRegions } from './lib/calculatePremiumOnlyRegions';
import { calculateUsageScale } from './lib/calculateUsageScale';
import { PartialUpgrade } from './lib/detectPartialUpgrade';
import { UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterDetailsProps {
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
		<DialogFooter className="mt-3 mb-12">
			<Button
				type="submit"
				variant="submit"
				className="rounded-full"
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
				<div className="grid grid-cols-3 items-start gap-6 text-foreground md:grid-cols-6">
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
				</div>
				{footer}
			</>
		);
	}

	return (
		<>
			<div className="grid grid-cols-3 items-start gap-6 text-foreground md:grid-cols-6">
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
			</div>
			{footer}
		</>
	);
}
