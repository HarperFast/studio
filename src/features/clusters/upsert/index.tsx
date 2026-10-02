import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { SubNavMenu } from '@/components/SubNavMenu';
import { SubNavSimpleLayout } from '@/components/SubNavSimpleLayout';
import { isFailed, isTerminated } from '@/components/ui/utils/badgeStatus';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { ClusterPageLayout } from '@/features/cluster/components/ClusterPageLayout';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { getHarperVersionsOptions, HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { getOrganizationRegionsQueryOptions } from '@/features/admin/organizationRegions/queries/getOrganizationRegions';
import { useStaffPermission } from '@/hooks/useAuth';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { Cluster, Organization } from '@/integrations/api/api.patch';
import { sortByField } from '@/lib/arrays/sort/byField';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouteContext } from '@tanstack/react-router';
import { ReactNode, useMemo } from 'react';
import { z } from 'zod';
import { ClusterForm } from './ClusterForm';
import { isUpsertClusterSchema } from './isUpsertClusterSchema';
import { buildUpgradeVersionOptions } from './lib/buildUpgradeVersionOptions';
import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from './lib/calculateDefaultDeploymentPerformanceAndRegionPlans';
import { detectPartialUpgrade } from './lib/detectPartialUpgrade';
import { buildRegionLookup, isOrganizationRegionId } from './lib/regionLookup';
import { buildRegionPlanDefaults, migrateDraftRegionPlans } from './lib/regionPlanDefaults';
import { RegionPlanEntry, UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

// Editing an existing cluster gets the cluster sub-nav rail (so Scaling/Version editing keep it);
// creating a new cluster has no cluster context yet, so it uses the plain breadcrumb layout.
function UpsertClusterLayout({ isEdit, className, children }: {
	isEdit: boolean;
	className?: string;
	children: ReactNode;
}) {
	if (isEdit) {
		return (
			<>
				<SubNavMenu />
				<ClusterPageLayout>
					<div className={className}>{children}</div>
				</ClusterPageLayout>
			</>
		);
	}
	return <SubNavSimpleLayout className={className}>{children}</SubNavSimpleLayout>;
}

export function UpsertCluster() {
	const { organizationId, clusterId, mode }: { organizationId: string; clusterId?: string; mode?: 'version' } =
		useParams({ strict: false });
	const { create, update } = useOrganizationClusterPermissions(organizationId);
	const { organization, cluster }: {
		organization: Organization;
		cluster?: Cluster;
	} = useRouteContext({ strict: false });
	const [savedClusterState, setSavedClusterState] = useLocalStorage<
		| null
		| ({
			clusterId?: string;
		} & (UpsertClusterSchemaType | Cluster))
	>(LocalStorageKeys.SavedClusterState, null);

	const { data: planTypes } = useQuery(getPlanTypesOptions(organizationId));
	const { data: regionLocationsColocated } = useQuery(getRegionLocationsOptions({
		availableHosts: true,
		organizationId,
	}));
	const { data: regionLocationsDedicated } = useQuery(getRegionLocationsOptions({ organizationId }));
	const { data: organizationRegionsData, isError: organizationRegionsFailed } = useQuery(
		getOrganizationRegionsQueryOptions(organizationId),
	);
	// A failed fetch must not strand a catalog-only form on "Loading…"; an edit that needs one of
	// the missing rows is refused below instead.
	const organizationRegions = organizationRegionsFailed ? organizationRegionsData ?? [] : organizationRegionsData;
	// Central-manager lets staff with the matching cluster permission place custom regions.
	const canUseCustomRegions = useStaffPermission(clusterId ? 'cluster:update' : 'cluster:create');
	const canWriteRegions = useStaffPermission('region:write');
	const canDefineCustomRegions = canUseCustomRegions && canWriteRegions;
	const cloudProvider = organization?.channel === 'Akamai' ? 'linode' : undefined;
	const lockedOrganizationRegionIds = useMemo(
		() => (cluster?.plans ?? []).map(plan => plan.regionId).filter((id): id is string => isOrganizationRegionId(id)),
		[cluster],
	);

	const { data: newHarperVersions } = useQuery(getHarperVersionsOptions(organizationId));
	const harperVersions = useMemo(() => {
		if (cluster?.instances && newHarperVersions) {
			return {
				...newHarperVersions,
				value: buildUpgradeVersionOptions(newHarperVersions.value ?? [], cluster.instances),
			} satisfies HarperVersionsResponse;
		}
		return newHarperVersions;
	}, [newHarperVersions, cluster]);

	// Detect a partially-upgraded cluster, where at least one instance failed to reach the version the
	// rest of the cluster is on. In that state the version picker pre-selects the latest version as
	// "current" and offers nothing newer, so the form can never become dirty — leaving no way to
	// re-run the upgrade for the lagging instances. We surface this so the form can allow re-submitting
	// the current target as a recovery path — unless a pinned (scoped) version is among the lagging
	// ones, in which case the target is ambiguous and the user picks it.
	const partialUpgrade = useMemo(
		() =>
			detectPartialUpgrade(
				cluster?.instances ?? [],
				(newHarperVersions?.value ?? []).filter(v => v.scoped).map(v => v.version),
			),
		[cluster, newHarperVersions],
	);

	const alreadyUsingFree = useMemo(() => {
		for (const orgCluster of organization?.clusters ?? []) {
			if (
				orgCluster.id !== cluster?.id
				&& planTypes
				&& !isTerminated(orgCluster.status)
				&& !isFailed(orgCluster.status)
				&& orgCluster.plans
			) {
				for (const clusterPlan of orgCluster.plans) {
					const foundPlan = planTypes.find(p => p.id === clusterPlan.planId);
					if (foundPlan?.priceUsd === 0 && !foundPlan.id.startsWith('self-hosted')) {
						return true;
					}
				}
			}
		}
		return false;
	}, [cluster?.id, organization?.clusters, planTypes]);

	const deploymentToPerformanceToPlan = useMemo<Record<string, Record<string, SchemaPlan>>>(
		() =>
			groupThenKeyBy(planTypes?.sort(sortByField('priceUsd')) || [], 'deploymentDescription', 'performanceDescription'),
		[planTypes],
	);

	const defaultsResult = useMemo<null | { values: UpsertClusterSchemaType; unresolvedRegionIds: string[] }>(() => {
		if (
			!planTypes || !harperVersions || !regionLocationsColocated || !regionLocationsDedicated || !organizationRegions
			|| (clusterId && !cluster)
		) {
			return null;
		}

		let clusterToLoad = cluster;

		const selectedPlan = planTypes?.find(planType => planType.id === cluster?.plans?.[0].planId);
		const regionLocations = selectedPlan?.deploymentDescription !== 'Dedicated'
			? regionLocationsColocated
			: regionLocationsDedicated;
		const regionLookup = buildRegionLookup(regionLocations, organizationRegions, cloudProvider);

		if (savedClusterState) {
			if (isUpsertClusterSchema(savedClusterState)) {
				const draftLookup = buildRegionLookup(
					savedClusterState.deploymentDescription !== 'Dedicated' ? regionLocationsColocated : regionLocationsDedicated,
					organizationRegions,
					cloudProvider,
				);
				return {
					values: {
						...savedClusterState,
						clusterName: savedClusterState.clusterName || '',
						abbreviatedName: savedClusterState.abbreviatedName || '',
						version: savedClusterState.version,
						deploymentDescription: savedClusterState.deploymentDescription || '',
						performanceDescription: savedClusterState.performanceDescription || '',
						fqdn: savedClusterState.fqdn || '',
						regionPlans: migrateDraftRegionPlans(savedClusterState.regionPlans, draftLookup),
						instances: savedClusterState.instances || [],
					},
					// The draft may have lost a region the live cluster still deploys; the refusal below
					// keys on the server's plans, not the draft.
					unresolvedRegionIds: buildRegionPlanDefaults(cluster?.plans, regionLookup).unresolvedRegionIds,
				};
			} else {
				clusterToLoad = savedClusterState;
			}
		}

		const regionPlans: RegionPlanEntry[] = [];
		let unresolvedRegionIds: string[] = [];
		const instances: z.infer<typeof UpsertClusterSchema.shape.instances> = [];
		const defaults = calculateDefaultDeploymentPerformanceAndRegionPlans(planTypes, regionLocations, alreadyUsingFree);

		let isSelfManaged = false;
		if (clusterToLoad) {
			if (clusterToLoad.plans) {
				const resolved = buildRegionPlanDefaults(clusterToLoad.plans, regionLookup);
				regionPlans.push(...resolved.regionPlans);
				unresolvedRegionIds = resolved.unresolvedRegionIds;
			}
			if (!regionPlans.length && clusterToLoad.instances) {
				const clusterInstances = clusterToLoad.instances
					.filter(instance => instance.status && !deletedClusterStatuses.includes(instance.status))
					.sort(byInstanceFqdnThenPort);
				for (const instance of clusterInstances) {
					isSelfManaged = true;
					instances.push({
						fqdn: instance.instanceFqdn,
						port: instance.operationsApiPort,
						secure: instance.operationsApiSecure ? 'true' : 'false',
					});
				}
			}
		} else if (defaults) {
			regionPlans.push(...defaults.regionPlans);
		}
		// A version edit never submits regions, so it must not carry a placeholder the schema rejects.
		if (!isSelfManaged && !regionPlans.length && mode !== 'version') {
			regionPlans.push({ regionId: '' });
		}

		// On an ambiguous partial upgrade the version picker pre-selects nothing: either choice then
		// dirties the form, so the user states the target instead of the form assuming the highest
		// version. Other modes show the field disabled, where the running version is the right display.
		const version = partialUpgrade?.ambiguous && mode === 'version'
			? undefined
			: harperVersions.value?.find(v => v.name === 'current')?.version
				?? harperVersions.value?.find(v => v.name === 'stable')?.version;

		return {
			values: {
				sourceClusterId: clusterToLoad?.id,
				autoRenew: clusterToLoad?.plans?.[0]?.autoRenew ?? true,
				clusterName: clusterToLoad?.name ?? '',
				abbreviatedName: clusterToLoad?.abbreviatedName ?? '',
				version,
				deploymentDescription: selectedPlan?.deploymentDescription ?? defaults?.deploymentDescription ?? '',
				performanceDescription: selectedPlan?.performanceDescription ?? defaults?.performanceDescription ?? '',
				fqdn: isSelfManaged ? clusterToLoad?.fqdn ?? '' : '',
				instances,
				regionPlans,
			},
			unresolvedRegionIds,
		};
	}, [
		alreadyUsingFree,
		cloudProvider,
		cluster,
		clusterId,
		mode,
		organizationRegions,
		partialUpgrade,
		planTypes,
		harperVersions,
		regionLocationsColocated,
		regionLocationsDedicated,
		savedClusterState,
	]);
	const defaultValues = defaultsResult?.values ?? null;

	const isLoading = !defaultValues || !organization || !planTypes || !regionLocationsColocated
		|| !regionLocationsDedicated || !organizationRegions;
	if (isLoading) {
		return (
			<UpsertClusterLayout isEdit={!!clusterId}>
				<Loading centered={true} text="Loading..." />
			</UpsertClusterLayout>
		);
	}

	// Editing with a region the form cannot resolve would save without it, which central-manager
	// treats as removing that region — so the form refuses to open instead.
	// A version-only edit never sends region plans, so an unresolvable one cannot be lost by it.
	if (mode !== 'version' && defaultsResult?.unresolvedRegionIds.length) {
		return (
			<UpsertClusterLayout isEdit={!!clusterId}>
				<ErrorComponent
					title={organizationRegionsFailed ? 'Custom Regions Unavailable' : 'Region Unavailable'}
					error={{
						message: organizationRegionsFailed
							? (
								<>
									This organization's custom regions could not be loaded, so this cluster cannot be edited right now.
									Please try again, or <ContactUs />.
								</>
							)
							: (
								<>
									This cluster deploys a region that is no longer available ({defaultsResult.unresolvedRegionIds.join(
										', ',
									)}), so it cannot be edited here. Please <ContactUs />.
								</>
							),
					}}
				/>
			</UpsertClusterLayout>
		);
	}

	if (cluster?.id ? !update : !create) {
		return (
			<UpsertClusterLayout isEdit={!!clusterId}>
				<ErrorComponent
					title={`Not Allowed`}
					error={{
						message: (
							<>
								You do not have permission to {cluster?.id ? 'update' : 'create'} clusters in this org.
							</>
						),
					}}
				/>
			</UpsertClusterLayout>
		);
	}

	if (planTypes.length === 0) {
		return (
			<UpsertClusterLayout isEdit={!!clusterId}>
				<ErrorComponent
					title={`Cluster ${clusterId ? 'Modification' : 'Creation'} Not Currently Allowed`}
					error={{
						message: (
							<>
								There are no available deployment types right now! Please try again later, or <ContactUs />.
							</>
						),
					}}
				/>
			</UpsertClusterLayout>
		);
	}

	return (
		<UpsertClusterLayout isEdit={!!clusterId} className="w-full max-w-6xl mx-auto">
			<ClusterForm
				alreadyUsingFree={alreadyUsingFree}
				clusterId={clusterId}
				defaultValues={defaultValues}
				deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
				harperVersions={harperVersions}
				mode={mode}
				organization={organization}
				organizationId={organizationId}
				organizationRegions={organizationRegions}
				canUseCustomRegions={canUseCustomRegions}
				canDefineCustomRegions={canDefineCustomRegions}
				lockedOrganizationRegionIds={lockedOrganizationRegionIds}
				partialUpgrade={partialUpgrade}
				planTypes={planTypes}
				regionLocationsColocated={regionLocationsColocated}
				regionLocationsDedicated={regionLocationsDedicated}
				setSavedClusterState={setSavedClusterState}
				startOffOnBilling={isUpsertClusterSchema(savedClusterState) && savedClusterState.skipToBilling === true}
			/>
		</UpsertClusterLayout>
	);
}
