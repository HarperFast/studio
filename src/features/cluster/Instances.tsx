import { DataTable } from '@/components/DataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { calculateInstanceFQDN } from '@/features/clusters/upsert/lib/calculateInstanceFQDN';
import { Instance } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { humanFileSize } from '@/lib/humanFileSize';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { EmptyCluster } from './EmptyCluster';
import { InstanceLogInCell } from './InstanceLogInCell';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export function Instances() {
	const { clusterId }: { clusterId: string; } = useParams({ strict: false });
	const { data: cluster, isLoading: clusterIsLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);
	const isSelfManaged = clusterIsSelfManaged(cluster);

	const columns: ColumnDef<Instance>[] = useMemo(
		() => ([
			{
				id: 'instanceActions',
				size: 1,
				minSize: 1,
				cell: (cell) => (<div className="flex justify-end">
					<InstanceLogInCell isSelfManaged={isSelfManaged} instance={cell.row.original} />
				</div>),
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
			!isSelfManaged && {
				accessorKey: 'status',
				header: 'Status',
				size: 1,
				minSize: 1,
				cell: (cell) => {
					const status = cell.getValue() as string;
					return <Badge variant={renderBadgeStatusVariant(status)}>{capitalizeWords(status)}</Badge>;
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
					return humanFileSize(value, Math.pow(1024, 3));
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
					return humanFileSize(value, Math.pow(1024, 2));
				},
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
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Card className="p-0 mt-4 min-h-96">
					<CardContent className="p-0 min-h-96">
						{clusterIsLoading
							? <TextLoadingSkeleton />
							: instances.length
								? <DataTable data={instances} columns={columns} />
								: <EmptyCluster />
						}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
