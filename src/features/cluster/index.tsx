import { humanFileSize } from '@/lib/humanFileSize';
import { getRouteApi } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import { useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { BadgeStatus, renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { InstanceTypes, renderInstanceTypeOption } from '@/lib/InstanceType';
import { useQuery } from '@tanstack/react-query';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { Instance } from '@/lib/api.patch';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { InstanceLogInCell } from '@/features/cluster/InstanceLogInCell';
import { EmptyCluster } from '@/features/cluster/EmptyCluster';

const route = getRouteApi('');

export function ClusterIndex() {
	const { clusterId } = route.useParams();
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const columns: ColumnDef<Instance>[] = useMemo(
		() => [
			{
				accessorKey: 'name', // Accessor key for the "name" field from data object
				header: 'Name', // Column header
			},
			{
				accessorKey: 'instanceFqdn',
				header: 'Instance Url',
				cell: (cell) => <InstanceLogInCell instance={cell.row.original} />,
			},
			{
				accessorKey: 'instanceTypeId',
				header: 'Instance Type',
				cell: (cell) => {
					return renderInstanceTypeOption(cell.getValue() as InstanceTypes);
				},
			},
			{
				accessorKey: 'status',
				header: 'Status',
				cell: (cell) => {
					const status = cell.getValue() as BadgeStatus;
					return <Badge variant={renderBadgeStatusVariant(status)}>{renderBadgeStatusText(status)}</Badge>;
				},
			},
			{
				accessorKey: 'version',
				header: 'Version',
			},
			{
				accessorKey: 'storageGb',
				header: 'Storage',
				cell: (cell) => {
					const value = cell.getValue() as number;
					return humanFileSize(value, Math.pow(1024, 3));
				},
			},
			{
				accessorKey: 'cpuCores',
				header: 'Cores/Threads',
				cell: (cell) => {
					return <>{cell.row.original.cpuCores} / {cell.row.original.threads}</>;
				},
			},
			{
				accessorKey: 'memoryMb',
				header: 'Memory',
				cell: (cell) => {
					const value = cell.getValue() as number;
					return humanFileSize(value, Math.pow(1024, 2));
				},
			},
		],
		[],
	);
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				{cluster?.instances?.length ? (
					<div className="flex items-center justify-between h-full text-sm text-white">
						<div className="w-full text-white">
							<h2 className="text-xl font-semibold">{cluster.name}</h2>
							<p className="text-xs md:text-sm">Cluster ID: {clusterId}</p>
						</div>
					</div>
				) : null}
			</nav>
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Card className="p-0 mt-4 min-h-96">
					<CardContent className="p-0 min-h-96">
						{clusterIsLoading
							? <TextLoadingSkeleton />
							: cluster?.instances?.length
								? <DataTable data={cluster.instances} columns={columns} />
								: <EmptyCluster />
						}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
