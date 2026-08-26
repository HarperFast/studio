import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { DialogFooter } from '@/components/ui/dialog';
import { hobbyistPlanId } from '@/config/constants';
import { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { ClusterAbbreviatedName } from '@/features/clusters/upsert/fields/ClusterAbbreviatedName';
import { ClusterDeploymentDescription } from '@/features/clusters/upsert/fields/ClusterDeploymentDescription';
import { ClusterFQDN } from '@/features/clusters/upsert/fields/ClusterFQDN';
import { ClusterGrantId } from '@/features/clusters/upsert/fields/ClusterGrantId';
import { ClusterName } from '@/features/clusters/upsert/fields/ClusterName';
import { ClusterPerformanceDescription } from '@/features/clusters/upsert/fields/ClusterPerformanceDescription';
import { ClusterSkipGtmWait } from '@/features/clusters/upsert/fields/ClusterSkipGtmWait';
import { ClusterVersion } from '@/features/clusters/upsert/fields/ClusterVersion';
import { needsBillingStep } from '@/features/clusters/upsert/lib/needsBillingStep';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant } from '@/integrations/api/api.patch';
import { ArrowRight, Layers3, Server } from 'lucide-react';
import { ReactNode, useEffect, useMemo } from 'react';
import { UseFormReturn, useFormState } from 'react-hook-form';
import { ClusterRegions } from './ClusterRegions';
import { ClusterInstances } from './components/ClusterInstances';
import { calculatePremiumOnlyRegions } from './lib/calculatePremiumOnlyRegions';
import { calculateUsageScale } from './lib/calculateUsageScale';
import { PartialUpgrade } from './lib/detectPartialUpgrade';
import { selectablePlansByTier } from './lib/selectablePlans';
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
	regionSetFrozen?: boolean;
	currentPlanId?: string;
	/** The organization's unclaimed vouchers, offered on create. */
	unboundGrants?: ClusterGrant[];
	/** A scoped grant is selected: its plan and regions are the request, so those pickers lock. */
	lockedByGrant?: boolean;
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
	regionSetFrozen,
	currentPlanId,
	unboundGrants,
	lockedByGrant,
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
		return Object.keys(plansByTier).map(performanceTier => {
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

	// Names for a scoped voucher's plan and region ids, so its coverage note reads the way the
	// pickers above it do. Falls back to the id for anything not in the catalogue.
	const planNameById = useMemo(
		() =>
			Object.fromEntries(
				Object.values(deploymentToPerformanceToPlan)
					.flatMap((tier) => Object.values(tier))
					.map((p) => [p.id, p.performanceDescription ?? p.id]),
			),
		[deploymentToPerformanceToPlan],
	);
	const regionNameById = useMemo(
		() => Object.fromEntries((regionLocations ?? []).map((r) => [r.id, r.region ?? r.id])),
		[regionLocations],
	);

	// On a partially-upgraded cluster the version is already pre-selected to the latest, so the form
	// never goes dirty — allow re-submitting it anyway so the lagging instances can be retried.
	const allowVersionResubmit = mode === 'version' && !!partialUpgrade;
	// The upgrade CTA opens the editor already showing the plan the customer came to buy, which makes
	// it the form's default — so `isDirty` is false and the submit button sits disabled on a form that
	// does have something to submit. Same shape as the version resubmit above: the intent came from
	// the route, not from a field the customer touched.
	const allowUpgradeResubmit = !!clusterId && !!currentPlanId && selectedPlan?.id !== currentPlanId;

	const footer = (
		<DialogFooter className="mt-6 mb-8 border-t border-border/60 pt-6">
			<Button
				className="w-full sm:w-auto"
				type="submit"
				variant="submit"
				disabled={isPending
					|| (clusterId && !isDirty && !allowVersionResubmit && !allowUpgradeResubmit)
					|| !isValid}
			>
				{needsBillingStep({ mode, totalPrice, grantId: form.watch('grantId') })
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
							<ClusterDeploymentDescription
								form={form}
								availableDeploymentTypes={availableDeploymentTypes}
								disabled={isHobbyist || lockedByGrant}
							/>

							<ClusterPerformanceDescription
								availablePerformanceDescriptions={availablePerformanceDescriptions}
								form={form}
								selectedDeployment={selectedDeployment}
								disabled={lockedByGrant}
							/>

							{isSelfManaged
								? <ClusterInstances form={form} />
								: (
									<ClusterRegions
										disabled={regionSetFrozen || lockedByGrant}
										disabledReason={lockedByGrant
											? 'Set by the grant chosen above. Choose None there to pick your own regions.'
											: undefined}
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
							{!clusterId && (
								<ClusterGrantId
									className="col-span-3"
									form={form}
									unboundGrants={unboundGrants}
									planNameById={planNameById}
									regionNameById={regionNameById}
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
