import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	AgentOverview,
	AgentWatch,
	agentWatchesQueryOptions,
	WATCH_MAX_PAGE,
} from '@/features/admin/agent/agentAdminApi';
import { formatUsd, LoadFailed } from '@/features/admin/agent/components/AgentBits';
import { RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="rounded-xl border bg-card/70 px-4 py-4 shadow-sm">
			<div className="text-xs font-medium text-muted-foreground">{label}</div>
			<div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
			{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
		</div>
	);
}

export function SpendPanel({ overview }: { overview: AgentOverview }) {
	return (
		<section aria-label="Spend" className="mt-6">
			<h2 className="text-lg font-light">Spend · {overview.month}</h2>
			<div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Stat
					label="Per-run cap"
					value={formatUsd(overview.runBudgetUsd)}
					hint={overview.runBudgetUsd === null ? 'Not set' : undefined}
				/>
				{overview.roles.map((role) => {
					const used = role.spentUsd + role.reservedUsd;
					const budget = role.monthlyBudgetUsd;
					return (
						<Stat
							key={role.role}
							label={`${role.role}${role.enabled ? '' : ' (off)'}`}
							value={`${formatUsd(role.spentUsd)} of ${budget === null ? 'no budget' : formatUsd(budget)}`}
							hint={[
								`${role.runs} run${role.runs === 1 ? '' : 's'} this month`,
								role.reservedUsd ? `${formatUsd(role.reservedUsd)} held by runs in flight` : null,
								budget ? `${Math.min(100, Math.round((used / budget) * 100))}% used` : null,
							].filter(Boolean).join(' · ')}
						/>
					);
				})}
			</div>
			{overview.roles.length === 0 && (
				<p className="mt-2 text-sm text-muted-foreground">
					No agent role reports spend.
				</p>
			)}
		</section>
	);
}

function watchValue(value: unknown): string {
	if (value === null || value === undefined) { return '—'; }
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function WatchRow({ watch }: { watch: AgentWatch }) {
	return (
		<TableRow>
			<TableCell className="font-mono text-xs">{watch.clusterId}</TableCell>
			<TableCell>
				<div className="flex flex-col">
					<span className="font-mono text-xs">{watch.key}</span>
					<span className="text-xs text-muted-foreground">
						{watch.kind}
						{watch.threshold !== null && watch.threshold !== undefined ? ` · threshold ${watch.threshold}` : ''}
					</span>
				</div>
			</TableCell>
			<TableCell>
				{watch.firing ? <Badge variant="destructive">firing</Badge> : <Badge variant="outline">quiet</Badge>}
			</TableCell>
			<TableCell className="font-mono text-xs">{watchValue(watch.lastValue)}</TableCell>
			<TableCell className="text-xs">
				<Timestamp value={watch.lastEvaluatedAt} />
			</TableCell>
			<TableCell className="text-xs">
				<Timestamp value={watch.expiresAt} />
			</TableCell>
			<TableCell>
				{watch.runId && (
					<Link
						to="/admin/agent/$runId"
						params={{ runId: watch.runId }}
						className="font-mono text-xs underline-offset-2 hover:underline"
					>
						{watch.runId}
					</Link>
				)}
			</TableCell>
		</TableRow>
	);
}

export function WatchTable({ watches }: { watches: AgentWatch[] }) {
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Cluster</TableHead>
						<TableHead>Watching</TableHead>
						<TableHead>State</TableHead>
						<TableHead>Last value</TableHead>
						<TableHead>Last evaluated</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead>Opened by</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{watches.map((watch) => <WatchRow key={watch.id} watch={watch} />)}
				</TableBody>
			</Table>
		</div>
	);
}

/** Open watches, firing first (the server's order), re-read once a minute: they are evaluated every 15 minutes. */
export function WatchesPanel() {
	const { data, error, isLoading } = useQuery(agentWatchesQueryOptions());
	return (
		<section aria-label="Watches">
			<p className="text-sm text-muted-foreground max-w-3xl">
				Follow-up checks a finding opened. They notify only, and are evaluated every 15 minutes until they expire.
			</p>
			<div className="mt-4">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading watches…</p>
					: !data
					? <LoadFailed what="watches" error={error} />
					: (
						<>
							{error && <RefreshFailed error={error} />}
							{data.length === 0
								? <p className="text-sm text-muted-foreground">No watch is open.</p>
								: (
									<>
										{data.length >= WATCH_MAX_PAGE && (
											<p className="mb-2 text-sm text-muted-foreground">
												Showing the first {WATCH_MAX_PAGE} open watches, firing ones first.
											</p>
										)}
										<WatchTable watches={data} />
									</>
								)}
						</>
					)}
			</div>
		</section>
	);
}
