import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	AgentOverview,
	AgentWatch,
	agentWatchesQueryOptions,
	WATCH_MAX_PAGE,
} from '@/features/admin/agent/agentAdminApi';
import { formatUsd, LoadFailed, ScopeCell, WatchStateLabel } from '@/features/admin/agent/components/AgentBits';
import { RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

/** `2026-11` → `November 2026`; anything unparseable is shown as sent. */
export function monthLabel(month: string): string {
	const date = new Date(`${month}-01T00:00:00Z`);
	return Number.isNaN(date.getTime())
		? month
		: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
	return (
		<div className="min-w-0 border-r border-b px-5 py-3">
			<div className="text-xs font-medium text-muted-foreground">{label}</div>
			<div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
			{hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
		</div>
	);
}

export function SpendPanel({ overview }: { overview: AgentOverview }) {
	return (
		<section aria-label="Spend" className="mt-5 overflow-hidden rounded-xl border bg-card/60">
			<h2 className="border-b px-5 py-2 text-xs font-medium text-muted-foreground">
				Spend · {monthLabel(overview.month)}
			</h2>
			{/* Each stat draws its own right and bottom rule; the negative margins tuck the outer ones under the card's border, so any count wraps cleanly. */}
			<div className="-mr-px -mb-px grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
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
				<p className="border-t px-5 py-3 text-sm text-muted-foreground">
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
			<TableCell>
				<ScopeCell row={watch} />
			</TableCell>
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
				<WatchStateLabel firing={!!watch.firing} />
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
		<div className="overflow-x-auto rounded-lg border">
			<Table className="[&_th]:bg-muted/30 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_td]:px-4 [&_td]:py-3">
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
