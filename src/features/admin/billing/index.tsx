import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClusterBillingDetail } from '@/features/admin/billing/components/ClusterBillingDetail';
import { UsageCell } from '@/features/admin/billing/components/UsageCell';
import { getBillingClustersQueryOptions } from '@/features/admin/billing/queries/getBillingClusters';
import { getFleetUsageQueryOptions } from '@/features/admin/billing/queries/getFleetUsage';
import { getGrantsQueryOptions } from '@/features/admin/grants/queries/getGrants';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

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
	// A comp is deliberate revenue forgone, which is exactly what a billing reader is scanning for;
	// purchased and contracted are the ones that bill — through Stripe and offline respectively.
	if (grant.source === 'comped') {
		return { label: 'comped', variant: 'secondary', title: 'Covered without being invoiced' };
	}
	if (grant.source === 'trial') {
		return { label: 'trial', variant: 'secondary', title: 'On a time-boxed trial' };
	}
	if (grant.source === 'free') {
		return {
			label: 'free',
			variant: 'secondary',
			title: "A $0 plan on the customer's own infrastructure — never invoiced",
		};
	}
	if (grant.source === 'contracted') {
		return { label: 'contracted', variant: 'success', title: 'Billed offline under contract' };
	}
	return { label: grant.source, variant: 'success', title: 'Billed through Stripe' };
}

/**
 * Every cluster in the fleet and what pays for it. The row is the cluster, not the grant: a cluster
 * with no grant at all is the thing worth seeing, and a grant-shaped list cannot show an absence.
 *
 * Usage is the server's own rollup, one request per cluster — quota is enforced per region, and the
 * cohort a region's meters fold is subtle enough (core burns blocks oldest-first) that deriving it
 * here from raw blocks would be a second implementation free to drift. What is still missing is what
 * was actually charged: that needs `stripeInvoiceId` on a block to join to Stripe.
 */
export function BillingAdminIndex() {
	const clustersQuery = useQuery(getBillingClustersQueryOptions());
	// ACTIVE only: a settled grant is history, and what a billing reader needs is the one currently
	// covering the cluster — or the absence of one.
	const grantsQuery = useQuery(getGrantsQueryOptions({ status: 'ACTIVE' }));
	const { data: plans } = useQuery(getPlansQueryOptions());
	// One request for the whole fleet rather than one per row. A failure here is not fatal — the
	// billing columns stand on their own, so the page degrades to no meters rather than an error.
	const usageQuery = useQuery(getFleetUsageQueryOptions());

	const [search, setSearch] = useState('');
	const [cover, setCover] = useState(ANY);
	const [showTerminated, setShowTerminated] = useState('false');
	// One row open at a time: the detail is tall, and a page of them stops being a table.
	const [expanded, setExpanded] = useState<string | null>(null);

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

	const usageByCluster = useMemo(
		() => new Map((usageQuery.data?.clusters ?? []).map((row) => [row.clusterId, row])),
		[usageQuery.data],
	);

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

	// What the rows on screen add up to. Only clusters whose every plan resolves are counted, and how
	// many that was is shown alongside — a total quietly missing a cluster is worse than no total.
	const spend = useMemo(() => {
		let total = 0;
		let counted = 0;
		for (const { cluster } of rows) {
			const plansOnCluster = cluster.plans ?? [];
			if (plansOnCluster.length === 0) { continue; }
			const prices = plansOnCluster.map((rp) => planById.get(rp.planId)?.priceUsd);
			if (prices.some((value) => value == null)) { continue; }
			total += prices.reduce((sum: number, value) => sum + (value ?? 0), 0);
			counted += 1;
		}
		return { total, counted };
	}, [rows, planById]);

	const isLoading = clustersQuery.isLoading || grantsQuery.isLoading;
	const isError = clustersQuery.isError || grantsQuery.isError;

	return (
		<div>
			<div>
				<h1 className="text-2xl font-light">Billing</h1>
				<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
					What the fleet costs and what it is consuming — spend per period, how close each cluster is to its tightest
					ceiling, and the grant covering it. A cluster with no live grant is running on nothing.
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
										<SelectItem value="comped">Comped</SelectItem>
										<SelectItem value="free">Free</SelectItem>
										<SelectItem value="purchased">Purchased</SelectItem>
										<SelectItem value="contracted">Contracted</SelectItem>
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

							<div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm" aria-live="polite">
								<span className="text-muted-foreground">
									{rows.length} {rows.length === 1 ? 'cluster' : 'clusters'}
								</span>
								<span className="text-foreground">
									<span className="tabular-nums">{price.format(spend.total)}</span>
									<span className="text-muted-foreground">
										{' '}per period{spend.counted === rows.length ? '' : ` across ${spend.counted} priced`}
									</span>
								</span>
								{usageQuery.isError && (
									<span className="text-xs text-destructive">Usage unavailable — this needs billing:read.</span>
								)}
							</div>

							{(clustersQuery.data?.truncated || grantsQuery.data?.truncated || usageQuery.data?.truncated) && (
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
													<TableHead className="w-0" />
													<TableHead>Cluster</TableHead>
													<TableHead>Organization</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Plans</TableHead>
													<TableHead className="text-right">Spend</TableHead>
													<TableHead title="How close the cluster is to its tightest per-region ceiling. Quota is enforced per region, so this is the single most constrained region and metric, not a cluster-wide average.">
														Usage
													</TableHead>
													<TableHead>Covered by</TableHead>
													<TableHead>Renews</TableHead>
													<TableHead>Ends</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{rows.map(({ cluster, grant }) => {
													const badge = coverage(grant, cluster.status);
													const regions = cluster.plans ?? [];
													const usage = usageByCluster.get(cluster.id);
													const isOpen = expanded === cluster.id;
													return (
														<Fragment key={cluster.id}>
															<TableRow>
																<TableCell className="w-0 align-middle">
																	<button
																		type="button"
																		aria-label={`${isOpen ? 'Hide' : 'Show'} usage for ${cluster.id}`}
																		aria-expanded={isOpen}
																		disabled={!usage}
																		onClick={() => setExpanded(isOpen ? null : cluster.id)}
																		className="flex cursor-pointer items-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
																	>
																		<ChevronRightIcon
																			className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
																		/>
																	</button>
																</TableCell>
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
																	<UsageCell usage={usage} />
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
															{isOpen && usage && (
																<TableRow>
																	<TableCell colSpan={9} className="p-0">
																		<ClusterBillingDetail usage={usage} organizationId={cluster.organizationId} />
																	</TableCell>
																</TableRow>
															)}
														</Fragment>
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
