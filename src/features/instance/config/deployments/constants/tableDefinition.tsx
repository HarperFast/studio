import { Deployment } from '@/integrations/api/instance/deployments/types';
import { ColumnDef, createColumnHelper } from '@/lib/table';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { DeploymentSourceCell } from '../components/DeploymentSource';
import { DeploymentStatusBadge } from '../components/deploymentStatusBadge';
import { StagedReleaseNote } from '../components/StagedReleaseNote';
import { shortDeploymentId } from '../functions/deploymentSource';
import { StagedReleaseState } from '../functions/stagedRelease';

export interface DeploymentRow extends Deployment {
	release?: StagedReleaseState;
}

const columnHelper = createColumnHelper<DeploymentRow>();

function ago(ms?: number) {
	return ms ? translateSecondsToAgo((Date.now() - ms) / 1000, ms) : '—';
}

export function deploymentColumns(
	{ commitFilterable }: { commitFilterable: boolean },
): Array<ColumnDef<DeploymentRow>> {
	return [
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
					{props.row.original.status === 'staged' && <StagedReleaseNote release={props.row.original.release} />}
				</span>
			),
		}),
		columnHelper.display({
			header: 'Source',
			id: 'source',
			enableSorting: false,
			cell: (props) => <DeploymentSourceCell deployment={props.row.original} commitFilterable={commitFilterable} />,
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
}
