import { DataTable } from '@/components/DataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { ClusterPageLayout } from '@/features/cluster/components/ClusterPageLayout';
import { calculateInstanceFQDN } from '@/features/clusters/upsert/lib/calculateInstanceFQDN';
import { Instance } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { EmptyCluster } from './EmptyCluster';
import { InstanceActionsMenu } from './InstanceActionsMenu';
import { InstanceLogInCell } from './InstanceLogInCell';
import { InstanceRowContextMenu } from './InstanceRowContextMenu';
import { InstanceStatusCell } from './InstanceStatusCell';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function Instances() {
	const { clusterId }: { clusterId: string } = useParams({ strict: false });
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);
	const isSelfManaged = clusterIsSelfManaged(cluster);

	const columns: ColumnDef<Instance>[] = useMemo(
		() =>
			([
				{
					id: 'instanceActions',
					size: 1,
					minSize: 1,
					cell: (cell) => (
						<div className="flex justify-end gap-2 items-center">
							<InstanceLogInCell isSelfManaged={isSelfManaged} instance={cell.row.original} />
						</div>
					),
				},
				isSelfManaged && {
					accessorKey: 'instanceFqdn',
					size: 90,
					header: 'URL',
					cell: (cell) => {
						return calculateInstanceFQDN({
							secure: cell.row.original.operationsApiSecure ? 'true' : 'false',
							port: cell.row.original.operationsApiPort,
							fqdn: cell.row.original.instanceFqdn,
						});
					},
				},
				!isSelfManaged && {
					accessorKey: 'name',
					size: 90,
					header: 'Name',
				},
				// Self-hosted instances aren't monitored from here — no status column, and no per-instance
				// status requests (InstanceStatusCell polls each instance's operations API).
				!isSelfManaged && {
					accessorKey: 'status',
					header: 'Status',
					size: 1,
					minSize: 1,
					cell: (cell) => {
						const status = cell.getValue() as string;
						return (
							<div className="flex items-center gap-2">
								<InstanceStatusCell instance={cell.row.original} index={cell.row.index} />
								{status ? <Badge variant={renderBadgeStatusVariant(status)}>{capitalizeWords(status)}</Badge> : null}
							</div>
						);
					},
				},
				!isSelfManaged && {
					accessorKey: 'version',
					size: 1,
					minSize: 1,
					header: 'Version',
				},
				!isSelfManaged && {
					accessorKey: 'storageGb',
					size: 1,
					minSize: 1,
					header: 'Storage',
					cell: (cell) => {
						const value = cell.getValue() as number;
						return `${value} GB`; // This is already in GB
					},
				},
				!isSelfManaged && {
					accessorKey: 'usedStorageGb',
					size: 1,
					minSize: 1,
					header: 'Used Storage',
					cell: (cell) => {
						const value = cell.getValue();
						return value === undefined ? '-' : `${value} GB`;
					},
				},
				!isSelfManaged && {
					accessorKey: 'cpuCores',
					size: 1,
					minSize: 1,
					header: 'Cores/Threads',
					cell: (cell) => {
						return <>{cell.row.original.cpuCores} / {cell.row.original.threads}</>;
					},
				},
				!isSelfManaged && {
					accessorKey: 'memoryMb',
					size: 1,
					minSize: 1,
					header: 'Memory',
					cell: (cell) => {
						const value = cell.getValue() as number;
						return `${value / 1024} GB`; // The value is in MiB since that's how memory is sold, but alwayas says MB or GB instead of MiB or GiB
					},
				},
				{
					id: 'instanceMenu',
					size: 1,
					minSize: 1,
					cell: (cell) => (
						<div className="flex justify-end">
							<InstanceActionsMenu isSelfManaged={isSelfManaged} instance={cell.row.original} />
						</div>
					),
				},
			] satisfies Array<ColumnDef<Instance> | false>).filter(excludeFalsy),
		[isSelfManaged],
	);
	const instances = useMemo(
		() => {
			if (!cluster?.instances) {
				return [];
			}
			return cluster.instances
				.filter(instance => instance.status && !deletedClusterStatuses.includes(instance.status))
				.sort(byInstanceFqdnThenPort);
		},
		[cluster],
	);
	return (
		<>
			<SubNavMenu />
			<ClusterPageLayout>
				<Card className="p-0 min-h-96">
					<CardContent className="p-0 min-h-96">
						{clusterIsLoading
							? <TextLoadingSkeleton />
							: instances.length
							? (
								<DataTable
									data={instances}
									columns={columns}
									renderRowWrapper={(instance, row) => (
										<InstanceRowContextMenu instance={instance} isSelfManaged={isSelfManaged}>
											{row}
										</InstanceRowContextMenu>
									)}
								/>
							)
							: <EmptyCluster />}
					</CardContent>
				</Card>
			</ClusterPageLayout>
		</>
	);
}
