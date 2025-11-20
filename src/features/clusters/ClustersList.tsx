import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isTerminated } from '@/components/ui/utils/badgeStatus';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { UpsertCluster } from '@/features/clusters/upsert';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';

export function ClustersList() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const { create } = useOrganizationClusterPermissions(organizationId);
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const [savedClusterState] = useLocalStorage<unknown | null>(LocalStorageKeys.SavedClusterState, null);

	const [filterByNameValue, setFilterByNameValue] = useState('');
	const clearFilterByNameValue = useCallback(() => setFilterByNameValue(''), []);

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		setFilterByNameValue(e.currentTarget.value?.toLowerCase() || '');
	}, []);

	const runningClusters = useMemo(() =>
		orgInfo?.clusters
			?.slice()
			.filter(cluster => !isTerminated(cluster.status))
			.sort(byClusterStatusThenName)
		|| [], [orgInfo?.clusters]);

	const filteredClusters = useMemo(() =>
		runningClusters
			.filter(curryFilterByFuzzySearch<Cluster>(['id', 'name'], filterByNameValue))
		|| [], [filterByNameValue, runningClusters]);

	if (orgInfo && runningClusters.length === 0 && create) {
		return <UpsertCluster />;
	}
	if (savedClusterState) {
		return <Navigate to={`/${organizationId}/new-cluster`} />;
	}

	return (
		<>
			<SubNavMenu>
				{isSuccess ? (
					<div className="flex w-full justify-end gap-2">
						<Input
							placeholder="Filter by name"
							className="inline-block w-48 md:w-64 bg-black border"
							value={filterByNameValue}
							onChange={onFilterByNameChanged}
						/>

						{create && (
							<Link to="new-cluster">
								<Button
									variant="positive"
									className="w-full rounded-full md:w-44"
									accessKey="n"
								>
									<Plus />{' '}
									<span>
										<u>N</u>ew Cluster
									</span>
								</Button>
							</Link>
						)}
					</div>
				) : null}
			</SubNavMenu>
			<section className="mt-40 md:mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12 mb-4">
					{filteredClusters.map((cluster) => (
						<div key={cluster.id} className="col-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
							<ClusterCard cluster={cluster} />
						</div>
					))}
					{!filteredClusters.length && (
						<div className="col-span-1 md:col-span-12 text-center">
							<h2 className="my-4 text-xl">No matches found.</h2>
							<Button variant="outline" onClick={clearFilterByNameValue}>Clear Filters</Button>
						</div>)}
				</div>
			</section>
		</>
	);
}
