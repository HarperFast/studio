import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { ClusterCard } from '@/features/clusters/components/ClusterCard';
import { NewClusterModal } from '@/features/clusters/modals/NewClusterModal';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/lib/api.patch';
import { byClusterStatusThenName } from '@/lib/arrays/sort/byClusterStatusThenName';
import { groupBy } from '@/lib/groupBy';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useDeleteClusterMutation } from './mutations/deleteCluster';
import SubNavMenu from '@/components/SubNavMenu';

const route = getRouteApi('');

export function ClustersList() {
	const queryClient = useQueryClient();
	const { organizationId }: { organizationId: string; } = route.useParams();
	const { create } = useOrganizationClusterPermissions(organizationId);
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const { mutate: deleteCluster, isPending: isDeletingClusterPending } = useDeleteClusterMutation();

	const [isNewClusterModalOpen, setIsNewClusterModalOpen] = useState(false);
	const [isDeleteClusterModalOpen, setIsDeleteClusterModalOpen] = useState(false);
	const [deleteClusterInfo, setDeleteClusterInfo] = useState({
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
			'status',
		);
		return {
			keys: Object.keys(groups),
			groups,
		};
	}, [filterByNameValue, orgInfo?.clusters]);

	const handleDeleteCluster = useCallback(
		(clusterInfo: { id: string; name: string }) => {
			if (clusterInfo) {
				deleteCluster(clusterInfo.id, {
					onSuccess: () => {
						toast.success('Success', {
							description: `Cluster successfully deleted.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
						setIsDeleteClusterModalOpen(false);
					},
					onError: () => {
						toast.error('Error', {
							description: `Failed to delete cluster: ${clusterInfo.name}.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						setIsDeleteClusterModalOpen(false);
					},
				});
			}
		},
		[deleteCluster, queryClient, setIsDeleteClusterModalOpen],
	);

	const onDeleteClusterModal = useCallback((cluster: Cluster) => {
		setDeleteClusterInfo({
			id: cluster.id,
			name: cluster.name,
		});
		setIsDeleteClusterModalOpen(true);
	}, []);

	return (
		<>
			<SubNavMenu>
				{isSuccess && orgInfo?.clusters?.length ? (
					<div className="flex items-center justify-between h-full text-sm text-white">
						<div className="w-full">
							<Input
								placeholder="Filter by name"
								className="inline-block w-full md:w-64 bg-black border"
								onChange={onFilterByNameChanged}
							/>
							{/*<Button className="inline-block w-2/5 md:w-auto md:ml-4" onClick={notYetImplemented}>*/}
							{/*	Sort by A-Z*/}
							{/*	<span>*/}
							{/*		<ChevronDown className="inline-block" />*/}
							{/*	</span>*/}
							{/*</Button>*/}
						</div>

						{create && (
							<Button
								variant="positive"
								className="w-full rounded-full md:w-44"
								accessKey="n"
								onClick={() => setIsNewClusterModalOpen(true)}
							>
								<Plus />{' '}
								<span>
									<u>N</u>ew Cluster
								</span>
							</Button>
						)}
					</div>
				) : null}
			</SubNavMenu>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				{clustersData.keys.length ? (
					clustersData.keys.map((clusterStatus) => (
						<div key={clusterStatus}>
							<h2 className="mb-2">
								<Badge variant={renderBadgeStatusVariant(clusterStatus)}>{renderBadgeStatusText(clusterStatus)}</Badge>
							</h2>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-12 mb-4">
								{clustersData.groups[clusterStatus].map((cluster) => (
									<div key={cluster.id} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
										<ClusterCard cluster={cluster} onDeleteClusterModal={onDeleteClusterModal} />
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
							<Button
								variant="positive"
								className="w-full rounded-full md:w-44"
								accessKey="n"
								onClick={() => setIsNewClusterModalOpen(true)}
							>
								<Plus />{' '}
								<span>
									<u>N</u>ew Cluster
								</span>
							</Button>
						)}
					</div>
				)}
			</section>
			<NewClusterModal
				orgId={organizationId}
				isModalOpen={isNewClusterModalOpen}
				setIsModalOpen={(isOpen: boolean) => setIsNewClusterModalOpen(isOpen)}
			/>
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="cluster"
				nameOfThingBeingDeleted={deleteClusterInfo.name}
				isModalOpen={isDeleteClusterModalOpen}
				setIsModalOpen={(isOpen: boolean) => setIsDeleteClusterModalOpen(isOpen)}
				deletionConfirmed={() => handleDeleteCluster(deleteClusterInfo)}
				deletionPending={isDeletingClusterPending}
			/>
		</>
	);
}
