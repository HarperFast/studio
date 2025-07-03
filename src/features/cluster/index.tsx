import { getRouteApi, Link } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/DataTable';
import { useEffect, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { EditInstanceModal } from './modals/EditInstanceModal';
import { BadgeStatus, renderBadgeStatusText, renderBadgeStatusVariant } from '@/components/ui/utils/badgeStatus';
// import { useRegistrationInfo } from '@/hooks/instance/useRegistrationInfo';
import { InstanceLogInModal } from './modals/InstanceLoginInModal';
import { renderInstanceTypeOption, InstanceTypes } from '@/lib/InstanceType';
import { useCluster } from '@/features/cluster/hooks/useCluster';

// 1. Once successfully logging into one instance, we should be able to use the same credentials(cookie) for all instances in the cluster.
// Essentially looping through and do a query to logging into all the other instances.

// 2. Depending upon the status, we should call that instance's API to get the latest status and update the UI accordingly.

// 3. Navigate to the instance once the user clicks on the instance URL. If the instance is in a "PROVISIONING" state, we should show a loading spinner and disable the button until the instance is ready.

const route = getRouteApi('');

type ColumnTypes = {
	id: string;
	name: string;
	instanceFqdn: string;
	instanceTypeId: string;
	status: string;
	version: string;
	storage: string;
	cpu: string;
	memory: string;
	operationsApiPort: number; // Added property
};

function EmptyCluster() {
	return (
		<div className="flex-col items-center justify-center px-16 space-y-3 text-center pt-30">
			<p>No instances found.</p>
		</div>
	);
}

export function ClusterIndex() {
	const { clusterId } = route.useParams();
	const { currentCluster, isAuthenticated, loadCluster, isLoading } = useCluster(); // Assuming currentCluster is the one we need
	// const { mutate: submitRegistrationData, data: registrationInfo } = useRegistrationInfo();

	useEffect(() => {
		loadCluster(clusterId);
	}, [loadCluster, clusterId]);

	const columns: ColumnDef<ColumnTypes, unknown>[] = useMemo(
		() => [
			{
				accessorKey: 'name', // Accessor key for the "name" field from data object
				header: 'Name', // Column header
			},
			{
				accessorKey: 'instanceFqdn',
				header: 'Instance Url',
				cell: (cell) => {
					const instanceURL = cell.getValue() as string;
					if (!['CLONE_READY', 'RUNNING', 'UPDATED'].includes(cell.row.original.status)) {
						return <p>N/A</p>;
					}
					// isLoggedIn is being used inside the JSX below
					return (
						<>
							{!isAuthenticated ? (
								<InstanceLogInModal
									instanceId={cell.row.original.id}
									instanceUrl={instanceURL}
									port={cell.row.original.operationsApiPort}
									instanceName={cell.row.original.name}
								/>
							) : (
								<Link
									to={`instance/${cell.row.original.id}/browse`}
									className="text-sm"
									aria-label={`Go to ${cell.row.original.name} instance`}
									title={`Go to ${cell.row.original.name} instance`}
								>
									<span className="py-2 hover:border-b-2">View</span>
								</Link>
							)}
						</>
					);
				},
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
				accessorKey: 'storage',
				header: 'Storage',
			},
			{
				accessorKey: 'cpu',
				header: 'CPU',
			},
			{
				accessorKey: 'memory',
				header: 'Memory',
			},
			{
				id: 'actions',
				header: () => '',
				cell: (cell) => {
					if (!['CLONE_READY', 'RUNNING', 'UPDATED'].includes(cell.row.original.status)) {
						return null;
					}
					return <EditInstanceModal instanceId={cell.row.original.id} instanceName={cell.row.original.name} />;
				},
			},
		],
		[clusterId, isAuthenticated]
	);
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				{currentCluster?.instances.length ? (
					<div className="flex items-center justify-between h-full text-sm text-white">
						<div className="w-full text-white">
							<h2 className="text-xl font-semibold">{currentCluster?.name}</h2>
							<p className="text-xs md:text-sm">Cluster ID: {clusterId}</p>
						</div>
					</div>
				) : null}
			</nav>
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Card className="p-0 mt-4 min-h-96">
					<CardContent className="p-0 min-h-96">
						{isLoading ? (
							<div>Loading...</div> // TODO: Add skeleton component
						) : currentCluster?.instances.length ? (
							<DataTable data={currentCluster?.instances as unknown as ColumnTypes[]} columns={columns} />
						) : (
							<EmptyCluster />
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
