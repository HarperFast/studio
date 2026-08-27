import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { hobbyistPlanId } from '@/config/constants';
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
import { selectablePlansByTier } from './lib/selectablePlans';
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
	regionSetFrozen?: boolean;
	currentPlanId?: string;
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
	regionSetFrozen,
	currentPlanId,
	selectedDeployment,
	selectedPerformance,
	selectedPlan,
	totalPrice,
}: ClusterDetailsProps) {
	const { isDirty, isValid } = useFormState();
	// Hobbyist is colocated-only, so the deployment picker has nothing to offer while it is selected.
	// Only when editing: on the create page Hobbyist can be the default selection for an org that
	// already holds a free cluster, and locking deployment there would strand someone who wanted a
	// dedicated or self-hosted cluster on a picker they cannot change.
	const isHobbyist = !!clusterId && selectedPlan?.id === hobbyistPlanId;
	const availablePerformanceDescriptions = useMemo(() => {
		const plansByTier = selectablePlansByTier(deploymentToPerformanceToPlan[selectedDeployment] || {}, {
			isExistingCluster: !!clusterId,
			currentPlanId,
			selectedPerformance,
		});
		// Premium means "costs money", matching calculatePremiumOnlyRegions. Keyed on planLevel it
		// disagreed with itself inside one form: Hobbyist is planLevel 0 like the trial, so the $20
		// tier carried no badge while the regions inside it did.
		const hasFreeTier = Object.values(plansByTier).some(plan => !plan.priceUsd);
		return Object.keys(plansByTier).map(performanceTier => {
			const isPremium = hasFreeTier && !!plansByTier[performanceTier].priceUsd;
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
	}, [clusterId, currentPlanId, deploymentToPerformanceToPlan, selectedDeployment, selectedPerformance]);
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
	// The upgrade CTA opens the editor already showing the plan the customer came to buy, which makes
	// it the form's default — so `isDirty` is false and the submit button sits disabled on a form that
	// does have something to submit. Same shape as the version resubmit above: the intent came from
	// the route, not from a field the customer touched.
	const allowUpgradeResubmit = !!clusterId && !!currentPlanId && selectedPlan?.id !== currentPlanId;

	const footer = (
		<DialogFooter className="mt-3 mb-12">
			<Button
				type="submit"
				variant="submit"
				disabled={isPending
					|| (clusterId && !isDirty && !allowVersionResubmit && !allowUpgradeResubmit)
					|| !isValid}
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

				<ClusterDeploymentDescription
					form={form}
					availableDeploymentTypes={availableDeploymentTypes}
					disabled={isHobbyist}
				/>

				<ClusterPerformanceDescription
					availablePerformanceDescriptions={availablePerformanceDescriptions}
					form={form}
					selectedDeployment={selectedDeployment}
				/>

				{isSelfManaged
					? <ClusterInstances form={form} />
					: (
						<ClusterRegions
							disabled={regionSetFrozen}
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
