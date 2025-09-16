import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { useTerminateClusterMutation } from '@/features/clusters/mutations/terminateCluster';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { groupBy } from '@/lib/groupBy';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function ClustersList() {
	const queryClient = useQueryClient();
	const { organizationId }: { organizationId: string } = useParams({ strict: false });
	const { create } = useOrganizationClusterPermissions(organizationId);
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const { mutate: terminateCluster, isPending: isTerminateClusterPending } = useTerminateClusterMutation();

	const [isTerminateClusterModalOpen, setIsTerminateClusterModalOpen] = useState(false);
	const [terminateClusterInfo, setTerminateClusterInfo] = useState({
		id: '',
		name: '',
	});
	const [filterByNameValue, setFilterByNameValue] = useState('');

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		setFilterByNameValue(e.currentTarget.value?.toLowerCase() || '');
	}, []);

	const clustersData = useMemo(() => {
		const groups = groupBy(
			orgInfo?.clusters
				?.slice()
				.filter(curryFilterByFuzzySearch<Cluster>(['id', 'name'], filterByNameValue))
				.sort(byClusterStatusThenName) || [],
			'status'
		);
		return {
			keys: Object.keys(groups),
			groups,
		};
	}, [filterByNameValue, orgInfo?.clusters]);

	const handleTerminatedCluster = useCallback(
		(clusterInfo: { id: string; name: string }) => {
			if (clusterInfo) {
				terminateCluster(clusterInfo.id, {
					onSuccess: () => {
						toast.success('Success', {
							description: `Cluster successfully terminated.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						void queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
						setIsTerminateClusterModalOpen(false);
					},
					onError: () => {
						toast.error('Error', {
							description: `Failed to terminate cluster: ${clusterInfo.name}.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						setIsTerminateClusterModalOpen(false);
					},
				});
			}
		},
		[terminateCluster, queryClient, setIsTerminateClusterModalOpen]
	);

	const onTerminateClusterModal = useCallback((cluster: Cluster) => {
		setTerminateClusterInfo({
			id: cluster.id,
			name: cluster.name,
		});
		setIsTerminateClusterModalOpen(true);
	}, []);

	return (
		<>
			<SubNavMenu>
				{isSuccess && orgInfo?.clusters?.length ? (
					<div className="flex w-full justify-between">
						<Input
							placeholder="Filter by name"
							className="inline-block w-full md:w-64 bg-black border"
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
				{clustersData.keys.length ? (
					clustersData.keys.map((clusterStatus) => (
						<div key={clusterStatus}>
							<h2 className="mb-2">
								<Badge variant={renderBadgeStatusVariant(clusterStatus)}>{capitalizeWords(clusterStatus)}</Badge>
							</h2>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-12 mb-4">
								{clustersData.groups[clusterStatus].map((cluster) => (
									<div key={cluster.id} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
										<ClusterCard cluster={cluster} onTerminateClusterModal={onTerminateClusterModal} />
									</div>
								))}
							</div>
						</div>
					))
				) : (
					<div className="flex-col space-y-5 items-center justify-center text-center">
						<h2 className="text-2xl text-center text-white">
							No clusters found.
							{create && ' Create a new cluster.'}
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
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="cluster"
				transitiveVerb="Terminate"
				presentParticiple="Terminating"
				nameOfThingBeingDeleted={terminateClusterInfo.name}
				isModalOpen={isTerminateClusterModalOpen}
				setIsModalOpen={(isOpen: boolean) => setIsTerminateClusterModalOpen(isOpen)}
				deletionConfirmed={() => handleTerminatedCluster(terminateClusterInfo)}
				deletionPending={isTerminateClusterPending}
			/>
		</>
	);
}
