import { getRouteApi } from '@tanstack/react-router';
import { ClusterCard } from '@/features/organization/components/ClusterCard';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { NewClusterModal } from '@/features/clusters/modals/NewClusterModal';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { DeleteClusterConfirmationModal } from './modals/DeleteClusterConfirmationModal';
import { useDeleteClusterMutation } from './mutations/deleteCluster';
import { toast } from 'sonner';
import { queryKeys } from '@/react-query/constants';
import { groupBy } from '@/lib/group-by';
import { sortByName } from '@/lib/arrays/sort/byName';

const route = getRouteApi('');

export function ClustersList() {
	const queryClient = useQueryClient();
	const { organizationId } = route.useParams();
	const { data: orgInfo, isSuccess } = useSuspenseQuery(getOrganizationQueryOptions(organizationId));
	const { mutate: deleteCluster, isPending: isDeletingClusterPending } = useDeleteClusterMutation();
	const [isNewClusterModalOpen, setIsNewClusterModalOpen] = useState(false);
	const [isDeleteClusterModalOpen, setIsDeleteClusterModalOpen] = useState(false);
	const [deleteClusterInfo, setDeleteClusterInfo] = useState({
		id: '',
		name: '',
	});

	const clusterGroups = useMemo(() => {
		if (isSuccess && orgInfo?.clusters) {
			const { RUNNING, PROVISIONING, CLONE_READY, UPDATED, ...others } = groupBy(orgInfo.clusters, 'status');
			const successBuckets = [...(RUNNING || []), ...(PROVISIONING || []), ...(CLONE_READY || []), ...(UPDATED || [])].sort(sortByName);
			const otherBuckets = [...Object.values(others).flat()].sort(sortByName);
			return [
				{ name: 'Running', clusters: successBuckets },
				{ name: 'Inactive', clusters: otherBuckets },
			].filter(group => group.clusters.length);
		}
		return null;
	}, [isSuccess, orgInfo]);

	const handleDeleteCluster = useCallback((clusterInfo: { id: string; name: string }) => {
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
	}, [deleteCluster, queryClient, setIsDeleteClusterModalOpen]);

	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				{isSuccess && orgInfo?.clusters?.length ? (
					<div className="flex items-center justify-between h-full text-sm text-white">
						<div className="w-full">
							{/*<Input placeholder="Filter clusters by name" className="inline-block w-3/5 md:w-64" onChange={notYetImplemented} />*/}
							{/*<Button className="inline-block w-2/5 md:w-auto md:ml-4" onClick={notYetImplemented}>*/}
							{/*	Sort by A-Z*/}
							{/*	<span>*/}
							{/*		<ChevronDown className="inline-block" />*/}
							{/*	</span>*/}
							{/*</Button>*/}
						</div>

						<Button
							variant="positive"
							className="w-full rounded-full md:w-44"
							onClick={() => setIsNewClusterModalOpen(true)}
						>
							<Plus /> New Cluster
						</Button>
					</div>
				) : null}
			</nav>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<>
					{clusterGroups?.length ?
						clusterGroups?.map(clusterGroup =>
							<div key={clusterGroup.name}>
								<h2 className="mb-2">{clusterGroup.name}</h2>
								<div className="grid grid-cols-1 gap-4 md:grid-cols-12 mb-4">
									{clusterGroup.clusters.map((cluster) => (
										<div key={cluster.id}
											 className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
											<ClusterCard
												cluster={cluster}
												onDeleteClusterModal={() => {
													setDeleteClusterInfo({
														id: cluster.id,
														name: cluster.name,
													});
													setIsDeleteClusterModalOpen(true);
												}}
											/>
										</div>
									))}
								</div>
							</div>,
						)
						: (
							<div className="flex-col space-y-5 items-center justify-center text-center">
								<h2 className="text-2xl text-center text-white">
									No clusters found. Create a new cluster.</h2>

								<Button
									variant="positive"
									className="w-full rounded-full md:w-44"
									onClick={() => setIsNewClusterModalOpen(true)}
								>
									<Plus /> New Cluster
								</Button>
							</div>
						)}
				</>
			</section>
			<NewClusterModal
				orgId={organizationId}
				isModalOpen={isNewClusterModalOpen}
				setIsModalOpen={() => setIsNewClusterModalOpen(false)}
			/>
			<DeleteClusterConfirmationModal
				clusterInfo={deleteClusterInfo}
				isModalOpen={isDeleteClusterModalOpen}
				isDeletingClusterPending={isDeletingClusterPending}
				handleDeleteCluster={() => handleDeleteCluster(deleteClusterInfo)}
				setIsModalOpen={() => setIsDeleteClusterModalOpen(false)}
			/>
		</>
	);
}
