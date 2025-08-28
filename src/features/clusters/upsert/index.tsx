import { Loading } from '@/components/Loading';
import { SubNavMenu } from '@/components/SubNavMenu';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import {
	getRegionLocationsOptions,
	GetRegionLocationsParams,
} from '@/features/clusters/queries/getRegionLocationsQuery';
import { ClusterForm } from '@/features/clusters/upsert/ClusterForm';
import {
	calculateDefaultDeploymentPerformanceAndRegionPlans,
} from '@/features/clusters/upsert/lib/calculateDefaultDeploymentPerformanceAndRegionPlans';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { LocalStorageKeys, useLocalStorage } from '@/hooks/useLocalStorage';
import { SchemaPlan, SchemaRegion } from '@/lib/api.gen';
import { sortByField } from '@/lib/arrays/sort/byField';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';

export function UpsertCluster() {
	const { organizationId, clusterId }: { organizationId: string; clusterId?: string } = useParams({ strict: false });
	const [limitRegionParameters, setLimitRegionParameters] = useState<GetRegionLocationsParams>({ availableHosts: true });
	const [savedClusterState, setSavedClusterState] = useLocalStorage<null | ({
		clusterId?: string
	} & z.infer<typeof UpsertClusterSchema>)>(LocalStorageKeys.SavedClusterState, null);

	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId));
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const { data: planTypes } = useQuery(getPlanTypesOptions(organizationId));
	const { data: regionLocations } = useQuery(getRegionLocationsOptions(limitRegionParameters));

	const deploymentToPerformanceToPlan = useMemo<Record<string, Record<string, SchemaPlan>>>(() =>
		groupThenKeyBy(planTypes?.sort(sortByField('priceUsd')) || [], 'deploymentDescription', 'performanceDescription'), [planTypes]);
	const regionNameToLatencyToRegion = useMemo<Record<string, Record<string, SchemaRegion>>>(() =>
		groupThenKeyBy(regionLocations?.sort(sortByField('latencyDescription')) || [], 'region', 'latencyDescription'), [regionLocations]);

	const defaultValues = useMemo<null | z.infer<typeof UpsertClusterSchema>>(() => {
		if (savedClusterState) {
			return savedClusterState;
		}
		if (!planTypes || !regionLocations || (clusterId && !cluster)) {
			return null;
		}

		const selectedPlan = planTypes?.find(planType => planType.id === cluster?.plans?.[0].planId);

		const regionPlans: z.infer<typeof UpsertClusterSchema.shape.regionPlans> = [];
		const instances: z.infer<typeof UpsertClusterSchema.shape.instances> = [];
		const defaults = calculateDefaultDeploymentPerformanceAndRegionPlans(planTypes, regionLocations);

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
	}, [cluster, clusterId, planTypes, regionLocations, savedClusterState]);

	const isLoading = !defaultValues || !organization || !planTypes || !regionLocations;

	return (<>
		<SubNavMenu />
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))] relative">
			{isLoading
				? (<Loading centered={true} text="Loading..." />)
				: (<ClusterForm
					clusterId={clusterId}
					defaultValues={defaultValues}
					deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
					organization={organization}
					organizationId={organizationId}
					planTypes={planTypes}
					regionLocations={regionLocations}
					regionNameToLatencyToRegion={regionNameToLatencyToRegion}
					setLimitRegionParameters={setLimitRegionParameters}
					setSavedClusterState={setSavedClusterState}
					startOffOnBilling={!!savedClusterState}
				/>)}
		</div>
	</>);
}
