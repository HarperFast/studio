import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { SubNavSimpleLayout } from '@/components/SubNavSimpleLayout';
import { isFailed, isTerminated } from '@/components/ui/utils/badgeStatus';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
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
import { useMemo } from 'react';
import { z } from 'zod';
import { ClusterForm } from './ClusterForm';
import { isUpsertClusterSchema } from './isUpsertClusterSchema';
import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from './lib/calculateDefaultDeploymentPerformanceAndRegionPlans';
import { UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

export function UpsertCluster() {
	const { organizationId, clusterId }: { organizationId: string; clusterId?: string } = useParams({ strict: false });
	const { create, update } = useOrganizationClusterPermissions(organizationId);
	const { organization, cluster }: {
		organization: Organization;
		cluster?: Cluster
	} = useRouteContext({ strict: false });
	const [savedClusterState, setSavedClusterState] = useLocalStorage<null | ({
		clusterId?: string
	} & (UpsertClusterSchemaType | Cluster))>(LocalStorageKeys.SavedClusterState, null);

	const { data: planTypes } = useQuery(getPlanTypesOptions(organizationId));
	const { data: regionLocationsColocated } = useQuery(getRegionLocationsOptions({
		availableHosts: true,
		organizationId,
	}));
	const { data: regionLocationsDedicated } = useQuery(getRegionLocationsOptions({ organizationId }));

	const alreadyUsingFree = useMemo(() => {
		for (const orgCluster of organization?.clusters ?? []) {
			if (orgCluster.id !== cluster?.id
				&& planTypes
				&& !isTerminated(orgCluster.status)
				&& !isFailed(orgCluster.status)
				&& orgCluster.plans) {
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

	const deploymentToPerformanceToPlan = useMemo<Record<string, Record<string, SchemaPlan>>>(() =>
		groupThenKeyBy(planTypes?.sort(sortByField('priceUsd')) || [], 'deploymentDescription', 'performanceDescription'), [planTypes]);

	const defaultValues = useMemo<null | UpsertClusterSchemaType>(() => {
		if (!planTypes || !regionLocationsColocated || !regionLocationsDedicated || (clusterId && !cluster)) {
			return null;
		}

		let clusterToLoad = cluster;

		if (savedClusterState) {
			if (isUpsertClusterSchema(savedClusterState)) {
				return {
					...savedClusterState,
					clusterName: savedClusterState.clusterName || '',
					abbreviatedName: savedClusterState.abbreviatedName || '',
					deploymentDescription: savedClusterState.deploymentDescription || '',
					performanceDescription: savedClusterState.performanceDescription || '',
					fqdn: savedClusterState.fqdn || '',
					regionPlans: savedClusterState.regionPlans || [],
					instances: savedClusterState.instances || [],
				};
			} else {
				clusterToLoad = savedClusterState;
			}
		}

		const selectedPlan = planTypes?.find(planType => planType.id === cluster?.plans?.[0].planId);

		const regionPlans: z.infer<typeof UpsertClusterSchema.shape.regionPlans> = [];
		const instances: z.infer<typeof UpsertClusterSchema.shape.instances> = [];
		const regionLocations = selectedPlan?.deploymentDescription !== 'Dedicated'
			? regionLocationsColocated
			: regionLocationsDedicated;
		const defaults = calculateDefaultDeploymentPerformanceAndRegionPlans(planTypes, regionLocations, alreadyUsingFree);

		let isSelfManaged = false;
		if (clusterToLoad) {
			if (clusterToLoad.plans) {
				for (const plan of clusterToLoad.plans) {
					if (plan.regionId) {
						const selectedRegion = regionLocations.find(regionLocation => regionLocation.id === plan.regionId);
						if (selectedRegion) {
							regionPlans.push({
								regionName: selectedRegion.region,
								latencyDescription: selectedRegion.latencyDescription,
							});
						}
					}
				}
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
		if (!isSelfManaged && !regionPlans.length) {
			regionPlans.push({ regionName: '', latencyDescription: '' });
		}

		return {
			sourceClusterId: clusterToLoad?.id,
			autoRenew: clusterToLoad?.plans?.[0]?.autoRenew ?? true,
			clusterName: clusterToLoad?.name ?? '',
			abbreviatedName: clusterToLoad?.abbreviatedName ?? '',
			deploymentDescription: selectedPlan?.deploymentDescription ?? defaults?.deploymentDescription ?? '',
			performanceDescription: selectedPlan?.performanceDescription ?? defaults?.performanceDescription ?? '',
			fqdn: isSelfManaged ? clusterToLoad?.fqdn ?? '' : '',
			instances,
			regionPlans,
		};
	}, [alreadyUsingFree, cluster, clusterId, planTypes, regionLocationsColocated, regionLocationsDedicated, savedClusterState]);

	const isLoading = !defaultValues || !organization || !planTypes || !regionLocationsColocated || !regionLocationsDedicated;
	if (isLoading) {
		return (
			<SubNavSimpleLayout>
				<Loading centered={true} text="Loading..." />
			</SubNavSimpleLayout>
		);
	}

	if (cluster?.id ? !update : !create) {
		return (
			<SubNavSimpleLayout>
				<ErrorComponent
					title={`Not Allowed`}
					error={{
						message: <>
							You do not have permission to {cluster?.id ? 'update' : 'create'} clusters in this org.
						</>,
					}}
				/>
			</SubNavSimpleLayout>
		);
	}

	if (planTypes.length === 0) {
		return (
			<SubNavSimpleLayout>
				<ErrorComponent
					title={`Cluster ${clusterId ? 'Modification' : 'Creation'} Not Currently Allowed`}
					error={{
						message: <>
							There are no available deployment types right now! Please try again later, or <ContactUs />.
						</>,
					}}
				/>
			</SubNavSimpleLayout>
		);
	}

	return (
		<SubNavSimpleLayout>
			<ClusterForm
				alreadyUsingFree={alreadyUsingFree}
				clusterId={clusterId}
				defaultValues={defaultValues}
				deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
				organization={organization}
				organizationId={organizationId}
				planTypes={planTypes}
				regionLocationsColocated={regionLocationsColocated}
				regionLocationsDedicated={regionLocationsDedicated}
				setSavedClusterState={setSavedClusterState}
				startOffOnBilling={isUpsertClusterSchema(savedClusterState) && savedClusterState.skipToBilling === true}
			/>
		</SubNavSimpleLayout>
	);
}
