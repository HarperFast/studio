import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { AdminClusterGrant, ClusterGrant } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ExpiryPolicyPanel } from './components/ExpiryPolicyPanel';
import { getGrantsQueryOptions } from './queries/getGrants';

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
function stateBadge(grant: AdminClusterGrant): { label: string; variant: 'warning' | 'secondary' } | null {
	if (grant.isActive === false && grant.status === 'ACTIVE') { return { label: 'Lapsed', variant: 'warning' }; }
	if (grant.status === 'EXPIRED') { return { label: 'Expired', variant: 'secondary' }; }
	if (grant.status === 'REVOKED') { return { label: 'Revoked', variant: 'secondary' }; }
	return null;
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

/** A finished grant reads as history, not as a live row — same dimming as an inactive region. */
const isSettled = (grant: AdminClusterGrant) => grant.status !== 'ACTIVE' || grant.isActive === false;

/** 'any' is the unfiltered state. */
const ANY = 'any';

// The API's own enum values, not derived from fetched rows: with server-side narrowing the fetched
// rows only contain the value already picked, which would leave nothing to switch to.
const SOURCES: ClusterGrant['source'][] = ['trial', 'purchased', 'enterprise', 'gift', 'comp'];
const STATUSES: ClusterGrant['status'][] = ['ACTIVE', 'EXPIRED', 'REVOKED'];

export function GrantsAdminIndex() {
	const [search, setSearch] = useState('');
	const [source, setSource] = useState(ANY);
	const [status, setStatus] = useState(ANY);
	// Source and status narrow on the server, so the page stops fetching the world at fleet scale.
	const { data: report, isLoading, isError } = useQuery(getGrantsQueryOptions({
		source: source === ANY ? undefined : source,
		status: status === ANY ? undefined : status,
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
			)
			// Soonest-ending first; forever grants (null endsAt) sink to the bottom.
			.sort((a, b) => {
				const at = a.endsAt ? new Date(a.endsAt).getTime() : Infinity;
				const bt = b.endsAt ? new Date(b.endsAt).getTime() : Infinity;
				return at - bt;
			});
	}, [grants, search, orgNameById]);

	return (
		<div className="max-w-5xl">
			<div>
				<h1 className="text-2xl font-light">Grants</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Why each cluster may run and on what terms. Every grant across the fleet — its source, when it ends, and the
					next thing the expiry runner will do to it. A grant with no cluster is a voucher waiting for cluster creation
					to claim it.
				</p>
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
							{report?.truncated && (
								<p className="mb-4 text-sm text-amber-600 dark:text-amber-400" role="alert">
									Showing the first {report.limit}{' '}
									grants only — the server truncated the result. Anything past the limit is not in this list, and this
									filter only searches what was returned.
								</p>
							)}
							{filtered.length === 0
								? <p className="text-sm text-muted-foreground">No grants match the current filters.</p>
								: (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Grant</TableHead>
													<TableHead>Organization</TableHead>
													<TableHead>Cluster</TableHead>
													<TableHead>Source</TableHead>
													<TableHead>Next due</TableHead>
													<TableHead>Ends</TableHead>
													<TableHead>Reason</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{filtered.map((grant) => {
													const badge = stateBadge(grant);
													return (
														<TableRow key={grant.id} className={isSettled(grant) ? 'opacity-60' : undefined}>
															<TableCell className="font-mono text-xs font-medium">
																<span className="inline-flex items-center gap-2 whitespace-nowrap">
																	{grant.id}
																	{badge && (
																		<Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
																	)}
																</span>
															</TableCell>
															<TableCell
																className="max-w-48 truncate"
																title={formatOrgLabel(grant.organizationId, orgNameById.get(grant.organizationId))}
															>
																{formatOrgLabel(grant.organizationId, orgNameById.get(grant.organizationId))}
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
															<TableCell
																className="max-w-56 truncate text-muted-foreground"
																title={grant.reason ?? undefined}
															>
																{grant.reason ?? '—'}
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
		</div>
	);
}
