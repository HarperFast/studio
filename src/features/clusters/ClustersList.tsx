import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isTerminated } from '@/components/ui/utils/badgeStatus';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { UpsertCluster } from '@/features/clusters/upsert';
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from '@tanstack/react-router';
import { Plus, SearchIcon } from 'lucide-react';
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
				{isSuccess && create && (
					<div className="flex w-full justify-end">
						<Link to="new-cluster">
							<Button variant="positive" accessKey="n">
								<Plus />{' '}
								<span className="hidden sm:inline-block">
									<u>N</u>ew <span className="hidden md:inline-block">Cluster</span>
								</span>
							</Button>
						</Link>
					</div>
				)}
			</SubNavMenu>
			<OrgPageLayout>
				<div className="relative mb-4 max-w-xs">
					<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Filter by name"
						className="pl-8 text-xs bg-transparent border-border/60"
						value={filterByNameValue}
						onChange={onFilterByNameChanged}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-9 mb-4">
					{filteredClusters.map((cluster) => (
						<div key={cluster.id} className="col-span-1 md:col-span-3 xl:col-span-3 2xl:col-span-2">
							<ClusterCard cluster={cluster} />
						</div>
					))}
					{!filteredClusters.length && (
						<div className="col-span-1 md:col-span-9 text-center">
							<h2 className="my-4 text-xl">No matches found.</h2>
							<Button type="button" variant="outline" onClick={clearFilterByNameValue}>Clear Filters</Button>
						</div>
					)}
				</div>
			</OrgPageLayout>
		</>
	);
}
