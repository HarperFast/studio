import { DataTable } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckStatus, checkStatus } from '@/features/admin/monitoring/checkStatus';
import {
	ClusterMonitoringPolicyRow,
	notifyPoliciesQueryOptions,
} from '@/features/admin/monitoring/monitoringPolicyApi';
import { PolicyBadge, PolicyTarget, SetPolicyDialog } from '@/features/admin/monitoring/SetPolicyDialog';
import { useStaffPermission } from '@/hooks/useAuth';
import { ColumnDef } from '@/lib/table';
import { useQuery } from '@tanstack/react-query';
import { HistoryIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

const formatTime = (value?: string | number | null) => (value == null ? '—' : new Date(value).toLocaleString());

export function MonitoringPolicyAdminIndex() {
	// dataUpdatedAt is the clock for "stuck": reading it re-renders on every poll, even when the rows are unchanged.
	const { data, isLoading, isError, dataUpdatedAt } = useQuery(notifyPoliciesQueryOptions());
	const canWrite = useStaffPermission('monitoringPolicy:write');
	// undefined: closed; null: open on the cluster search; a target: open on that cluster.
	const [editing, setEditing] = useState<PolicyTarget | null | undefined>(undefined);
	const [historyOf, setHistoryOf] = useState<ClusterMonitoringPolicyRow | null>(null);

	const columns = useMemo(
		() => buildColumns({ canWrite, now: dataUpdatedAt, onChange: setEditing, onHistory: setHistoryOf }),
		[canWrite, dataUpdatedAt],
	);

	return (
		<div className="max-w-6xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Monitoring</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Clusters on notify: their criticals go to the alert digest instead of paging the on-call. Nothing is
						silenced.
					</p>
				</div>
				{canWrite && (
					<Button variant="submit" onClick={() => setEditing(null)} className="shrink-0">
						<PlusIcon />
						Set policy
					</Button>
				)}
			</div>

			<div className="mt-6">
				{isError && (
					<p className="mb-3 text-sm text-destructive">
						{data
							? 'Could not refresh the list; showing the last one loaded.'
							: 'Could not load the clusters on notify.'}
					</p>
				)}
				{isLoading
					? <Skeleton className="h-40 w-full" />
					: isError && !data
					? null
					: data?.length
					? <DataTable columns={columns} data={data} />
					: <p className="text-sm text-muted-foreground">No cluster is on notify: every cluster pages.</p>}
			</div>

			{editing !== undefined && (
				<SetPolicyDialog
					key={editing?.clusterId ?? 'search'}
					initial={editing}
					onClose={() => setEditing(undefined)}
				/>
			)}
			<PolicyHistoryDialog row={historyOf} onClose={() => setHistoryOf(null)} />
		</div>
	);
}

function buildColumns({ canWrite, now, onChange, onHistory }: {
	canWrite: boolean;
	now: number;
	onChange: (target: PolicyTarget) => void;
	onHistory: (row: ClusterMonitoringPolicyRow) => void;
}): ColumnDef<ClusterMonitoringPolicyRow>[] {
	return [
		{
			header: 'Cluster',
			size: 22,
			cell: ({ row }) => (
				<div className="min-w-0">
					<span className="block truncate">{row.original.clusterName ?? row.original.clusterId}</span>
					<span className="block truncate font-mono text-xs text-muted-foreground">{row.original.clusterId}</span>
				</div>
			),
		},
		{
			header: 'Organization',
			size: 16,
			cell: ({ row }) => (
				<span className="block truncate">{row.original.organizationName || row.original.organizationId}</span>
			),
		},
		{
			header: 'Reason',
			size: 26,
			cell: ({ row }) => <span className="line-clamp-2 break-words">{row.original.reason || '—'}</span>,
		},
		{
			header: 'Set',
			size: 16,
			cell: ({ row }) => (
				<span className="text-sm">
					<span className="block">{row.original.setBy ?? '—'}</span>
					<span className="block text-muted-foreground">{formatTime(row.original.setAt)}</span>
				</span>
			),
		},
		{
			header: 'Checks',
			size: 12,
			cell: ({ row }) => <CheckStatusBadge status={checkStatus(row.original, now)} />,
		},
		{
			header: '',
			id: 'actions',
			size: 8,
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button variant="ghost" size="icon" aria-label="History" onClick={() => onHistory(row.original)}>
						<HistoryIcon />
					</Button>
					{canWrite && (
						<Button variant="ghost" size="icon" aria-label="Change" onClick={() => onChange(row.original)}>
							<PencilIcon />
						</Button>
					)}
				</div>
			),
		},
	];
}

function describeCheckStatus(
	status: CheckStatus,
): { label: string; detail: string; variant: 'success' | 'warning' | 'destructive' | 'outline' } {
	switch (status.state) {
		case 'applied':
			return { label: 'Applied', detail: `Synthetic checks updated ${formatTime(status.at)}.`, variant: 'success' };
		case 'skipped':
			return {
				label: 'Not stamped',
				detail: `Nothing was stamped (${status.gate}) at ${formatTime(status.at)}.`,
				variant: 'outline',
			};
		case 'errors':
			return {
				label: `Errors (${status.errors.length})`,
				detail: status.errors.map((entry) => `${entry.target}: ${entry.error ?? 'failed'}`).join('\n'),
				variant: 'destructive',
			};
		case 'pending':
			return status.stuck
				? {
					label: 'Not confirmed',
					detail: `The checks have not confirmed the change made ${
						formatTime(status.since)
					}. Setting the policy again re-runs it.`,
					variant: 'warning',
				}
				: { label: 'Updating', detail: `Since ${formatTime(status.since)}.`, variant: 'outline' };
	}
}

function CheckStatusBadge({ status }: { status: CheckStatus }) {
	const { label, detail, variant } = describeCheckStatus(status);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span>
					<Badge variant={variant}>{label}</Badge>
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs whitespace-pre-line">{detail}</TooltipContent>
		</Tooltip>
	);
}

function PolicyHistoryDialog({ row, onClose }: { row: ClusterMonitoringPolicyRow | null; onClose: () => void }) {
	const history = [...(row?.history ?? [])].reverse();
	return (
		<Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Policy history</DialogTitle>
					<DialogDescription>{row ? `${row.clusterName ?? row.clusterId} · newest first` : ''}</DialogDescription>
				</DialogHeader>
				<ol className="max-h-96 space-y-3 overflow-y-auto text-sm">
					{history.map((change, index) => (
						<li key={`${change.setAt}-${index}`} className="rounded-md border p-3">
							<div className="flex items-center justify-between gap-3">
								<PolicyBadge policy={change.monitoringPolicy} />
								<span className="text-muted-foreground">
									{change.setBy ?? 'unknown'} · {formatTime(change.setAt)}
								</span>
							</div>
							{change.reason && <p className="mt-2 break-words">{change.reason}</p>}
						</li>
					))}
				</ol>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>Close</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
