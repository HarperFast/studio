import { Deployment } from '@/integrations/api/instance/deployments/types';
import { ColumnDef, createColumnHelper } from '@/lib/table';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { DeploymentStatusBadge } from '../components/deploymentStatusBadge';
import { deploymentSource, shortDeploymentId } from '../functions/deploymentSource';

const columnHelper = createColumnHelper<Deployment>();

function ago(ms?: number) {
	return ms ? translateSecondsToAgo((Date.now() - ms) / 1000, ms) : '—';
}

export const deploymentColumns: Array<ColumnDef<Deployment>> = [
	columnHelper.display({
		header: 'Deployment',
		id: 'deployment_id',
		enableSorting: false,
		cell: (props) => (
			<span className="font-mono text-xs" title={props.row.original.deployment_id}>
				{shortDeploymentId(props.row.original.deployment_id)}
			</span>
		),
	}),
	{
		header: 'Component',
		accessorKey: 'project',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Status',
		id: 'status',
		enableSorting: false,
		cell: (props) => (
			<span className="flex flex-wrap items-center gap-1">
				<DeploymentStatusBadge status={props.row.original.status} />
				{props.row.original.status === 'staged' && (
					<span className="text-xs text-muted-foreground">waiting to be activated</span>
				)}
			</span>
		),
	}),
	columnHelper.display({
		header: 'Source',
		id: 'source',
		enableSorting: false,
		cell: (props) => {
			const source = deploymentSource(props.row.original);
			return source
				? <span className="break-all text-xs" title={source.title}>{source.label}</span>
				: '—';
		},
	}),
	{
		header: 'User',
		accessorKey: 'user',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Started',
		id: 'started_at',
		enableSorting: false,
		cell: (props) => ago(props.row.original.started_at),
	}),
];
