import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getBillingClustersQueryOptions } from '@/features/admin/billing/queries/getBillingClusters';
import { getGrantsQueryOptions } from '@/features/admin/grants/queries/getGrants';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

const ANY = 'any';

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtDate = (iso: string | null | undefined) => {
	if (!iso) { return '—'; }
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? '—' : dateFmt.format(at);
};

const price = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Terminal clusters are gone, not billable — hidden unless asked for. */
const TERMINAL = new Set(['TERMINATED', 'FAILED']);

type Cover = { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary'; title: string };

/**
 * What is paying for this cluster, in one word. The two that want attention are a cluster running
 * with no live grant at all, and one whose grant has lapsed but that the expiry runner has not acted
 * on yet — both mean service is being given away without a decision behind it.
 */
function coverage(grant: AdminClusterGrant | undefined, status: string | null | undefined): Cover {
	// A terminated cluster having no grant is the expected end state, not a problem — raising the
	// same alarm there would train the reader to ignore it on the rows that matter.
	if (TERMINAL.has(status ?? '')) {
		return { label: '—', variant: 'secondary', title: 'Gone — nothing left to cover' };
	}
	if (!grant) {
		return { label: 'None', variant: 'destructive', title: 'No grant covers this cluster' };
	}
	if (grant.isActive === false) {
		return {
			label: 'Lapsed',
			variant: 'warning',
			title: 'The grant is past its end date but the expiry runner has not acted on it yet',
		};
	}
	// A comp or gift is deliberate revenue forgone, which is exactly what a billing reader is
	// scanning for; purchased and enterprise are the ones that bill.
	if (grant.source === 'comp' || grant.source === 'gift') {
		return { label: grant.source, variant: 'secondary', title: 'Covered without being invoiced' };
	}
	if (grant.source === 'trial') {
		return { label: 'trial', variant: 'secondary', title: 'On a time-boxed trial' };
	}
	return { label: grant.source, variant: 'success', title: 'Billed' };
}

/**
 * Every cluster in the fleet and what pays for it. The row is the cluster, not the grant: a cluster
 * with no grant at all is the thing worth seeing, and a grant-shaped list cannot show an absence.
 *
 * Usage and charged amounts are deliberately not here — they live on PurchasedBlock, many per
 * cluster, and belong to their own view.
 */
export function BillingAdminIndex() {
	const clustersQuery = useQuery(getBillingClustersQueryOptions());
	// ACTIVE only: a settled grant is history, and what a billing reader needs is the one currently
	// covering the cluster — or the absence of one.
	const grantsQuery = useQuery(getGrantsQueryOptions({ status: 'ACTIVE' }));
	const { data: plans } = useQuery(getPlansQueryOptions());

	const [search, setSearch] = useState('');
	const [cover, setCover] = useState(ANY);
	const [showTerminated, setShowTerminated] = useState('false');

	// At most one ACTIVE grant per cluster, enforced server-side, so last-write-wins is not a choice
	// being made here.
	const grantByCluster = useMemo(() => {
		const map = new Map<string, AdminClusterGrant>();
		for (const grant of grantsQuery.data?.grants ?? []) {
			if (grant.clusterId) { map.set(grant.clusterId, grant); }
		}
		return map;
	}, [grantsQuery.data]);

	const planById = useMemo(() => new Map((plans ?? []).map((p) => [p.id, p])), [plans]);

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (clustersQuery.data?.clusters ?? [])
			.filter((cluster) => {
				if (showTerminated !== 'true' && TERMINAL.has(cluster.status ?? '')) { return false; }
				const grant = grantByCluster.get(cluster.id);
				if (cover !== ANY && coverage(grant, cluster.status).label.toLowerCase() !== cover) { return false; }
				if (!q) { return true; }
				return cluster.id.toLowerCase().includes(q)
					|| cluster.name.toLowerCase().includes(q)
					|| cluster.organizationId.toLowerCase().includes(q)
					|| (cluster.organizationName ?? '').toLowerCase().includes(q);
			})
			.map((cluster) => ({ cluster, grant: grantByCluster.get(cluster.id) }));
	}, [clustersQuery.data, grantByCluster, search, cover, showTerminated]);

	/** What the cluster's region plans cost per period, summed across regions. */
	const monthly = (plansOnCluster: { planId: string }[] | null | undefined) => {
		let total = 0;
		let known = true;
		for (const rp of plansOnCluster ?? []) {
			const plan = planById.get(rp.planId);
			if (!plan) {
				known = false;
				continue;
			}
			total += plan.priceUsd;
		}
		return known ? price.format(total) : '—';
	};

	const isLoading = clustersQuery.isLoading || grantsQuery.isLoading;
	const isError = clustersQuery.isError || grantsQuery.isError;

	return (
		<div>
			<div>
				<h1 className="text-2xl font-light">Billing</h1>
				<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
					Every cluster in the fleet and what pays for it — its plans, the grant covering it, and when that renews or
					ends. A cluster with no live grant is running on nothing.
				</p>
			</div>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading clusters…</p>
					: isError
					? (
						<p className="text-sm text-destructive">
							Couldn't load the fleet. This needs <code>org:read</code> and <code>grant:read</code>.
						</p>
					)
					: (
						<>
							<div className="mb-4 flex flex-wrap items-center gap-2">
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Filter by cluster or organization…"
									aria-label="Filter clusters"
									className="max-w-md"
								/>
								<Select value={cover} onValueChange={setCover}>
									<SelectTrigger className="w-44" aria-label="Coverage">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ANY}>Any coverage</SelectItem>
										<SelectItem value="none">No grant</SelectItem>
										<SelectItem value="lapsed">Lapsed</SelectItem>
										<SelectItem value="trial">Trial</SelectItem>
										<SelectItem value="comp">Comp</SelectItem>
										<SelectItem value="gift">Gift</SelectItem>
										<SelectItem value="purchased">Purchased</SelectItem>
										<SelectItem value="enterprise">Enterprise</SelectItem>
									</SelectContent>
								</Select>
								<Select value={showTerminated} onValueChange={setShowTerminated}>
									<SelectTrigger className="w-48" aria-label="Terminated clusters">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="false">Live clusters</SelectItem>
										<SelectItem value="true">Include terminated</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
								{rows.length} {rows.length === 1 ? 'cluster' : 'clusters'}
							</p>

							{(clustersQuery.data?.truncated || grantsQuery.data?.truncated) && (
								<p className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 px-3 py-2 text-sm text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
									This is a partial view — the fleet is larger than one page, so some clusters or their grants are
									missing. Narrow the filters rather than reading this as the whole picture.
								</p>
							)}

							{rows.length === 0
								? <p className="text-sm text-muted-foreground">No clusters match those filters.</p>
								: (
									<div className="overflow-x-auto">
										<Table className="[&_th]:pr-4 [&_td]:pr-4">
											<TableHeader>
												<TableRow>
													<TableHead>Cluster</TableHead>
													<TableHead>Organization</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Plans</TableHead>
													<TableHead className="text-right">Per period</TableHead>
													<TableHead>Covered by</TableHead>
													<TableHead>Renews</TableHead>
													<TableHead>Ends</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{rows.map(({ cluster, grant }) => {
													const badge = coverage(grant, cluster.status);
													const regions = cluster.plans ?? [];
													return (
														<TableRow key={cluster.id}>
															<TableCell className="font-medium">
																<div className="flex h-9 flex-col justify-center">
																	<Link
																		className="font-mono underline underline-offset-2 hover:no-underline"
																		to={`/${cluster.organizationId}/${cluster.id}`}
																	>
																		{cluster.id}
																	</Link>
																	<span className="text-xs font-normal text-muted-foreground">{cluster.name}</span>
																</div>
															</TableCell>
															<TableCell className="max-w-48 truncate">
																<Link
																	className="underline underline-offset-2 hover:no-underline"
																	to={`/${cluster.organizationId}`}
																	title={cluster.organizationId}
																>
																	{cluster.organizationName ?? cluster.organizationId}
																</Link>
															</TableCell>
															<TableCell className="whitespace-nowrap text-muted-foreground">
																{cluster.status ?? '—'}
																{cluster.suspendedReason && (
																	<Tooltip>
																		<TooltipTrigger asChild>
																			<Badge variant="warning" className="ml-2 text-[10px]">suspended</Badge>
																		</TooltipTrigger>
																		<TooltipContent>{cluster.suspendedReason}</TooltipContent>
																	</Tooltip>
																)}
															</TableCell>
															<TableCell className="whitespace-nowrap text-muted-foreground">
																{regions.length === 0
																	? '—'
																	: `${regions.length} × ${[...new Set(regions.map((r) => r.planId))].join(', ')}`}
															</TableCell>
															<TableCell className="text-right tabular-nums whitespace-nowrap">
																{monthly(regions)}
															</TableCell>
															<TableCell>
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Badge variant={badge.variant} className="w-24 text-[10px]">{badge.label}</Badge>
																	</TooltipTrigger>
																	<TooltipContent>{badge.title}</TooltipContent>
																</Tooltip>
															</TableCell>
															<TableCell className="whitespace-nowrap">{fmtDate(grant?.nextCycleAt)}</TableCell>
															<TableCell className="whitespace-nowrap">{fmtDate(grant?.endsAt)}</TableCell>
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
		</div>
	);
}
