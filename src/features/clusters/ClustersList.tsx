import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { UpsertCluster } from '@/features/clusters/upsert';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';

export function ClustersList() {
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const { create } = useOrganizationClusterPermissions(organizationId);
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));

	const [filterByNameValue, setFilterByNameValue] = useState('');

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		setFilterByNameValue(e.currentTarget.value?.toLowerCase() || '');
	}, []);

	const clusters = useMemo(() =>
		orgInfo?.clusters
			?.slice()
			.filter(cluster => cluster.status !== 'TERMINATED')
			.filter(curryFilterByFuzzySearch<Cluster>(['id', 'name'], filterByNameValue))
			.sort(byClusterStatusThenName) || [], [filterByNameValue, orgInfo?.clusters]);

	if (!clusters.length && create) {
		return <UpsertCluster />;
	}

	return (
		<>
			<SubNavMenu>
				{isSuccess ? (
					<div className="flex w-full justify-end gap-2">
						<Input
							placeholder="Filter by name"
							className="inline-block w-48 md:w-64 bg-black border"
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
				{clusters.length ? (
					<div className="grid grid-cols-1 gap-4 md:grid-cols-12 mb-4">
						{clusters.map((cluster) => (
							<div key={cluster.id} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
								<ClusterCard cluster={cluster} />
							</div>
						))}
					</div>
				) : (
					<div className="flex-col space-y-5 items-center justify-center text-center">
						<h2 className="text-2xl text-center text-white">
							No clusters found.{!create ? ' Talk to your org admin to create one!' : ''}
						</h2>

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
				)}
			</section>
		</>
	);
}
