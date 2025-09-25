import { ContactUs } from '@/components/ContactUs';
import { ErrorComponent } from '@/components/ErrorComponent';
import { Loading } from '@/components/Loading';
import { SubNavSimpleLayout } from '@/components/SubNavSimpleLayout';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { getRegionLocationsOptions } from '@/features/clusters/queries/getRegionLocationsQuery';
import { ClusterForm } from '@/features/clusters/upsert/ClusterForm';
import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from '@/features/clusters/upsert/lib/calculateDefaultDeploymentPerformanceAndRegionPlans';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { Cluster, Organization } from '@/lib/api.patch';
import { sortByField } from '@/lib/arrays/sort/byField';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouteContext } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';

export function UpsertCluster() {
	const { organizationId, clusterId }: { organizationId: string; clusterId?: string } = useParams({ strict: false });
	const [onlyShowAvailableHosts, setOnlyShowAvailableHosts] = useState(true);
	const { organization, cluster }: { organization: Organization; cluster?: Cluster } = useRouteContext({ strict: false });
	const [savedClusterState, setSavedClusterState] = useLocalStorage<null | ({
		clusterId?: string
	} & z.infer<typeof UpsertClusterSchema>)>(LocalStorageKeys.SavedClusterState, null);

	const { data: planTypes } = useQuery(getPlanTypesOptions(organizationId));
	const { data: regionLocationsAvailableHosts } = useQuery(getRegionLocationsOptions({
		availableHosts: true,
		organizationId,
	}));
	const { data: regionLocationsAll } = useQuery(getRegionLocationsOptions({ organizationId }));
	const regionLocations = onlyShowAvailableHosts ? regionLocationsAvailableHosts : regionLocationsAll;

	const alreadyUsingFree = useMemo(() => {
		for (const orgCluster of organization?.clusters ?? []) {
			if (orgCluster.id !== cluster?.id
				&& planTypes
				&& orgCluster.status !== 'TERMINATED'
				&& orgCluster.plans) {
				for (const clusterPlan of orgCluster.plans) {
					const foundPlan = planTypes.find(p => p.id === clusterPlan.planId);
					if (foundPlan?.priceUsd === 0) {
						return true;
					}
				}
			}
		}
		return false;
	}, [cluster?.id, organization?.clusters, planTypes]);

	const deploymentToPerformanceToPlan = useMemo<Record<string, Record<string, SchemaPlan>>>(() =>
		groupThenKeyBy(planTypes?.sort(sortByField('priceUsd')) || [], 'deploymentDescription', 'performanceDescription'), [planTypes]);
	const regionNameToLatencyToRegion = useMemo<Record<string, Record<string, SchemaRegion>>>(() =>
		groupThenKeyBy(regionLocations?.sort(sortByField('latencyDescription')) || [], 'region', 'latencyDescription'), [regionLocations]);

	const defaultValues = useMemo<null | z.infer<typeof UpsertClusterSchema>>(() => {
		if (savedClusterState) {
			return savedClusterState;
		}
		if (!planTypes || !regionLocationsAvailableHosts || !regionLocationsAll || (clusterId && !cluster)) {
			return null;
		}

		const selectedPlan = planTypes?.find(planType => planType.id === cluster?.plans?.[0].planId);

		const regionPlans: z.infer<typeof UpsertClusterSchema.shape.regionPlans> = [];
		const instances: z.infer<typeof UpsertClusterSchema.shape.instances> = [];
		const regionLocations = onlyShowAvailableHosts ? regionLocationsAvailableHosts : regionLocationsAll;
		const defaults = calculateDefaultDeploymentPerformanceAndRegionPlans(planTypes, regionLocations, alreadyUsingFree);

		let isSelfManaged = false;
		if (planTypes && regionLocations) {
			if (cluster) {
				if (cluster.plans) {
					for (const plan of cluster.plans) {
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
				if (!regionPlans.length && cluster.instances) {
					for (const instance of cluster.instances) {
						if (instance.status !== 'REMOVED') {
							isSelfManaged = true;
							instances.push({
								fqdn: instance.instanceFqdn,
								port: instance.operationsApiPort,
								secure: instance.operationsApiSecure ? 'true' : 'false',
							});
						}
					}
				}
			} else if (defaults) {
				regionPlans.push(...defaults.regionPlans);
			}
		}
		if (!isSelfManaged && !regionPlans.length) {
			regionPlans.push({ regionName: '', latencyDescription: '' });
		}

		return {
			autoRenew: cluster?.plans?.[0]?.autoRenew ?? true,
			systemName: cluster?.name ?? '',
			abbreviatedName: cluster?.abbreviatedName ?? '',
			deploymentDescription: selectedPlan?.deploymentDescription ?? defaults?.deploymentDescription ?? '',
			performanceDescription: selectedPlan?.performanceDescription ?? defaults?.performanceDescription ?? '',
			fqdn: isSelfManaged ? cluster?.fqdn ?? '' : '',
			instances,
			regionPlans,
		};
	}, [alreadyUsingFree, cluster, clusterId, onlyShowAvailableHosts, planTypes, regionLocationsAll, regionLocationsAvailableHosts, savedClusterState]);

	const isLoading = !defaultValues || !organization || !planTypes || !regionLocations;
	if (isLoading) {
		return (
			<SubNavSimpleLayout>
				<Loading centered={true} text="Loading..." />
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
				clusterId={clusterId}
				defaultValues={defaultValues}
				deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
				organization={organization}
				organizationId={organizationId}
				planTypes={planTypes}
				regionLocations={regionLocations}
				regionNameToLatencyToRegion={regionNameToLatencyToRegion}
				setOnlyShowAvailableHosts={setOnlyShowAvailableHosts}
				setSavedClusterState={setSavedClusterState}
				startOffOnBilling={!!savedClusterState}
				alreadyUsingFree={alreadyUsingFree}
			/>
		</SubNavSimpleLayout>
	);
}
