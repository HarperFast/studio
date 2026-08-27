import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { useStaffPermission } from '@/hooks/useAuth';
import { AdminClusterGrant, ClusterGrant } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CreateGrantModal } from './components/CreateGrantModal';
import { ExpiryPolicyPanel } from './components/ExpiryPolicyPanel';
import { GrantFormModal } from './components/GrantFormModal';
import { getGrantsQueryOptions, GrantOrder } from './queries/getGrants';

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDate = (iso: string | null | undefined) => {
	if (!iso) { return '—'; }
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? '—' : dateFmt.format(at);
};

/**
 * The one state marker a row carries, shown inline on the grant id the way the regions table marks
 * an inactive region. "Lapsed" is the server-computed case a stored status can't show: an ACTIVE
 * row past its endsAt that the runner hasn't stamped yet.
 */
type BadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary';

function stateBadge(grant: AdminClusterGrant): { label: string; variant: BadgeVariant } {
	// Lapsed is the one that wants attention: the server says the grant is no longer live, but the
	// runner has not stamped it, so nothing has acted on the cluster yet.
	if (grant.isActive === false && grant.status === 'ACTIVE') { return { label: 'Lapsed', variant: 'warning' }; }
	// Revoked and Expired both end a grant, but not the same way — one ran its course, the other was
	// taken away by an admin. Sharing a colour lost the only distinction worth scanning for.
	if (grant.status === 'REVOKED') { return { label: 'Revoked', variant: 'destructive' }; }
	if (grant.status === 'EXPIRED') { return { label: 'Expired', variant: 'secondary' }; }
	return { label: 'Active', variant: 'success' };
}

/**
 * Stage and date of the next thing the expiry runner will do, off the server-computed timeline.
 * Studio deliberately holds no expiry offsets (see grantExpiry.ts), so with no timeline the cell
 * shows a dash rather than a guess.
 */
function nextDue(grant: AdminClusterGrant): string {
	const next = grant.timeline?.find((entry) => !entry.applied);
	if (!next) { return '—'; }
	return `${next.stage} · ${fmtDate(next.dueAt)}`;
}

/** 'any' is the unfiltered state. */
const ANY = 'any';

// The API's own enum values, not derived from fetched rows: with server-side narrowing the fetched
// rows only contain the value already picked, which would leave nothing to switch to.
const SOURCES: ClusterGrant['source'][] = ['trial', 'purchased', 'enterprise', 'gift', 'comp'];
const STATUSES: ClusterGrant['status'][] = ['ACTIVE', 'EXPIRED', 'REVOKED'];

export function GrantsAdminIndex() {
	const [search, setSearch] = useState('');
	const [source, setSource] = useState(ANY);
	// Settled grants are permanent history — nothing deletes them — so they grow without bound and
	// would eventually be all a reader sees. Live grants are bounded by the cluster count, and are
	// the ones anyone acts on, so the page opens on them.
	const [status, setStatus] = useState<string>('ACTIVE');
	// ends-at reads as history ("when did this end"); next-due answers the pipeline question
	// ("what fires next"). They genuinely disagree, so it is a choice rather than a default.
	const [order, setOrder] = useState<GrantOrder>('ends-at');
	const [editing, setEditing] = useState<AdminClusterGrant | null>(null);
	const [creating, setCreating] = useState(false);
	// The page needs grant:read; changing terms posts to the grant:write-gated endpoint.
	const canWriteGrants = useStaffPermission('grant:write');
	// Source and status narrow on the server, so the page stops fetching the world at fleet scale.
	const { data: report, isLoading, isError } = useQuery(getGrantsQueryOptions({
		source: source === ANY ? undefined : source,
		status: status === ANY ? undefined : status,
		order,
	}));
	const { data: orgResult } = useQuery(getOrganizationsQueryOptions());
	const grants = report?.grants;

	const orgNameById = useMemo(
		() => new Map((orgResult?.organizations ?? []).map((o) => [o.id, o.name])),
		[orgResult],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (grants ?? [])
			.filter((g) =>
				!q
				|| g.id.toLowerCase().includes(q)
				|| (g.clusterId ?? 'unbound').toLowerCase().includes(q)
				|| g.organizationId.toLowerCase().includes(q)
				|| (orgNameById.get(g.organizationId) ?? '').toLowerCase().includes(q)
				|| g.source.toLowerCase().includes(q)
				|| g.status.toLowerCase().includes(q)
				|| (g.currentStage ?? '').toLowerCase().includes(q)
				|| (g.reason ?? '').toLowerCase().includes(q)
			);
		// No client sort: the server orders the whole filtered set before capping, and re-sorting
		// here by endsAt would silently undo the next-due ordering it does not know about.
	}, [grants, search, orgNameById]);

	return (
		<div className="max-w-6xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Grants</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Why each cluster may run and on what terms. Every grant across the fleet — its source, when it ends, and the
						next thing the expiry runner will do to it. A grant with no cluster is a voucher waiting for cluster
						creation to claim it.
					</p>
				</div>
				{canWriteGrants && (
					<Button variant="submit" onClick={() => setCreating(true)} className="shrink-0">
						<PlusIcon />
						Create grant
					</Button>
				)}
			</div>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading grants…</p>
					: isError
					? (
						<p className="text-sm text-destructive">
							Couldn't load grants. Viewing this page needs the <code>grant:read</code> permission.
						</p>
					)
					: (!grants || grants.length === 0) && source === ANY && status === ANY
					? <p className="text-sm text-muted-foreground">No grants yet.</p>
					: (
						<>
							<div className="mb-4 flex flex-wrap items-center gap-2">
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Filter by grant, cluster, organization, or reason…"
									aria-label="Filter grants"
									className="max-w-md"
								/>
								<Select value={source} onValueChange={setSource}>
									<SelectTrigger className="w-36" aria-label="Filter by source">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value={ANY}>Any source</SelectItem>
											{SOURCES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
										</SelectGroup>
									</SelectContent>
								</Select>
								<Select value={order} onValueChange={(value) => setOrder(value as GrantOrder)}>
									<SelectTrigger className="w-44" aria-label="Sort order">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="ends-at">Soonest ending</SelectItem>
											<SelectItem value="next-due">Next stage due</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
								<Select value={status} onValueChange={setStatus}>
									<SelectTrigger className="w-36" aria-label="Filter by status">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value={ANY}>Any status</SelectItem>
											{STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
							<p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
								{filtered.length === (report?.returned ?? 0)
									? `${filtered.length} ${filtered.length === 1 ? 'grant' : 'grants'}`
									: `${filtered.length} of ${report?.returned} ${report?.returned === 1 ? 'grant' : 'grants'}`}
							</p>

							{
								/* Deliberately not "the first N": the server caps the walk before ordering, so a
							    truncated result is a sample rather than a prefix. Wording that stays true either
							    way, since sorting-before-capping is an open ask on the central-manager side. */
							}
							{report?.truncated && (
								<p
									className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
									role="alert"
								>
									<span className="font-medium">This list is incomplete.</span> {report.matched != null
										? `Showing the ${report.returned} soonest-ending of ${report.matched} matching grants.`
										: `The server returned ${report.returned} grants and stopped there.`}{' '}
									The filter box only searches the ones that loaded, so a grant that exists can look missing. Narrow the
									source or status filters to see the rest.
								</p>
							)}
							{filtered.length === 0
								? (
									<p className="text-sm text-muted-foreground">
										No grants match the current filters.
										{report?.truncated
											&& " A matching grant may exist past the server's limit — narrow the source or status filters and try again."}
									</p>
								)
								: (
									<div className="overflow-x-auto">
										<Table className="[&_th]:pr-4 [&_td]:pr-4 [&_td]:py-2.5">
											<TableHeader>
												<TableRow>
													<TableHead>Grant</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Reason</TableHead>
													<TableHead>Organization</TableHead>
													<TableHead>Cluster</TableHead>
													<TableHead>Source</TableHead>
													<TableHead>Next due</TableHead>
													<TableHead>Ends</TableHead>
													<TableHead className="w-0" />
												</TableRow>
											</TableHeader>
											<TableBody>
												{filtered.map((grant) => {
													// No row dimming here, unlike the regions table: most grants are settled, so
													// fading them faded the whole table and washed out the status colours. The
													// badge carries the state instead.
													const badge = stateBadge(grant);
													return (
														<TableRow key={grant.id}>
															<TableCell className="font-mono text-xs font-medium">{grant.id}</TableCell>
															<TableCell>
																{
																	/* Fixed width so the column reads as one edge: the variants' labels differ in
																    length, and w-fit badges left it ragged. */
																}
																<Badge variant={badge.variant} className="w-20 text-[10px]">{badge.label}</Badge>
															</TableCell>
															<TableCell className="max-w-44 text-muted-foreground">
																{grant.reason
																	? (
																		<Tooltip>
																			{
																				/* The cell truncates, so the tooltip is the only way to read a long
																			    reason — the native title attribute was too slow to discover. */
																			}
																			<TooltipTrigger asChild>
																				<span className="block truncate">{grant.reason}</span>
																			</TooltipTrigger>
																			<TooltipContent className="max-w-96">{grant.reason}</TooltipContent>
																		</Tooltip>
																	)
																	: '—'}
															</TableCell>
															<TableCell
																className="max-w-48 truncate"
																title={formatOrgLabel(grant.organizationId, orgNameById.get(grant.organizationId))}
															>
																{orgNameById.get(grant.organizationId) ?? grant.organizationId}
															</TableCell>
															<TableCell>
																{grant.clusterId
																	? (
																		<Link
																			className="font-mono text-xs underline underline-offset-2 hover:no-underline"
																			to={`/${grant.organizationId}/${grant.clusterId}`}
																		>
																			{grant.clusterId}
																		</Link>
																	)
																	: <Badge variant="secondary" className="text-[10px]">Unbound</Badge>}
															</TableCell>
															<TableCell>{grant.source}</TableCell>
															<TableCell className="whitespace-nowrap">{nextDue(grant)}</TableCell>
															<TableCell className="whitespace-nowrap">{fmtDate(grant.endsAt)}</TableCell>
															<TableCell className="text-right">
																{
																	/* Only an ACTIVE grant is editable: central-manager answers 409 for a
																    settled one, since its terms are history rather than knobs. */
																}
																{canWriteGrants && grant.status === 'ACTIVE' && (
																	<Button
																		variant="ghost"
																		size="icon"
																		aria-label={`Edit ${grant.id}`}
																		onClick={() => setEditing(grant)}
																	>
																		<PencilIcon />
																	</Button>
																)}
															</TableCell>
														</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								)}
						</>
					)}
			</div>

			<div className="mt-8">
				<ExpiryPolicyPanel />
			</div>

			<GrantFormModal open={!!editing} onOpenChange={(next) => !next && setEditing(null)} grant={editing} />
			<CreateGrantModal open={creating} onOpenChange={setCreating} />
		</div>
	);
}
