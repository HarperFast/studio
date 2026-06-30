import { Deployment } from '@/integrations/api/instance/deployments/types';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { DeploymentStatusBadge } from '../components/deploymentStatusBadge';

const columnHelper = createColumnHelper<Deployment>();

function ago(ms?: number) {
	return ms ? translateSecondsToAgo((Date.now() - ms) / 1000, ms) : '—';
}

export const deploymentColumns: Array<ColumnDef<Deployment>> = [
	{
		header: 'Project',
		accessorKey: 'project',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Status',
		id: 'status',
		enableSorting: false,
		cell: (props) => <DeploymentStatusBadge status={props.row.original.status} />,
	}),
	columnHelper.display({
		header: 'Started',
		id: 'started_at',
		enableSorting: false,
		cell: (props) => ago(props.row.original.started_at),
	}),
	columnHelper.display({
		header: 'Completed',
		id: 'completed_at',
		enableSorting: false,
		cell: (props) => ago(props.row.original.completed_at),
	}),
	{
		header: 'User',
		accessorKey: 'user',
		enableSorting: false,
	},
	{
		header: 'Origin',
		accessorKey: 'origin_node',
		enableSorting: false,
	},
];
