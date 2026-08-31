import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlanFormModal } from '@/features/admin/plans/components/PlanFormModal';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { RegionScope } from '@/features/admin/regions/index';
import { getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { useStaffPermission } from '@/hooks/useAuth';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

const ANY = 'any';

const price = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** The plan's billing period, which is also how long a purchased usage block lasts. */
function term(plan: SchemaPlan): string {
	const months = plan.planLimits?.expirationMonths;
	if (!months) { return '—'; }
	if (months === 1) { return 'monthly'; }
	if (months === 12) { return 'yearly'; }
	return `${months} mo`;
}

/**
 * The plan catalogue: what a customer can buy, what each tier gets, and what it costs. A cluster's
 * region plans point at these, so a plan is retired by going INACTIVE rather than deleted.
 */
export function PlansAdminIndex() {
	const { data: plans, isLoading, isError } = useQuery(getPlansQueryOptions());
	const { data: orgResult } = useQuery(getOrganizationsQueryOptions());
	const [search, setSearch] = useState('');
	const [deployment, setDeployment] = useState(ANY);
	// Retired plans are the minority and rarely what someone came to look at, but they are still
	// pointed at by running clusters — so they are one click away rather than hidden.
	const [status, setStatus] = useState('ACTIVE');
	const [editing, setEditing] = useState<SchemaPlan | null>(null);
	const [creating, setCreating] = useState(false);
	// The page needs plan:read, which every staff role holds; writing is narrower.
	const canWritePlans = useStaffPermission('plan:write');

	const orgNameById = useMemo(
		() => new Map((orgResult?.organizations ?? []).map((o) => [o.id, o.name])),
		[orgResult],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (plans ?? []).filter((plan) => {
			if (status !== ANY && (plan.status ?? 'ACTIVE') !== status) { return false; }
			if (deployment !== ANY && plan.deploymentType !== deployment) { return false; }
			if (!q) { return true; }
			return plan.id.toLowerCase().includes(q)
				|| plan.name.toLowerCase().includes(q)
				|| plan.deploymentDescription.toLowerCase().includes(q)
				|| plan.performanceDescription.toLowerCase().includes(q);
		});
	}, [plans, search, deployment, status]);

	return (
		<div>
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Plans</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						The catalogue a cluster's region plans point at — what each tier gets per instance, the usage block it
						mints, and what it costs. A plan scoped to organizations is only offered to those customers.
					</p>
				</div>
				{canWritePlans && (
					<Button variant="submit" onClick={() => setCreating(true)} className="shrink-0">
						<PlusIcon />
						Create plan
					</Button>
				)}
			</div>

			<div className="mt-6">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading plans…</p>
					: isError
					? (
						<p className="text-sm text-destructive">
							Couldn't load plans. You need <code>plan:read</code> to view them.
						</p>
					)
					: (
						<>
							<div className="mb-4 flex flex-wrap items-center gap-2">
								<Input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Filter by ID, name, or tier…"
									aria-label="Filter plans"
									className="max-w-md"
								/>
								<Select value={deployment} onValueChange={setDeployment}>
									<SelectTrigger className="w-44" aria-label="Deployment type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ANY}>Any deployment</SelectItem>
										<SelectItem value="colocated">colocated</SelectItem>
										<SelectItem value="dedicated">dedicated</SelectItem>
										<SelectItem value="self-hosted">self-hosted</SelectItem>
									</SelectContent>
								</Select>
								<Select value={status} onValueChange={setStatus}>
									<SelectTrigger className="w-36" aria-label="Status">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ACTIVE">ACTIVE</SelectItem>
										<SelectItem value="INACTIVE">INACTIVE</SelectItem>
										<SelectItem value={ANY}>Any status</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
								{filtered.length === (plans?.length ?? 0)
									? `${filtered.length} plans`
									: `${filtered.length} of ${plans?.length ?? 0} plans`}
							</p>

							{filtered.length === 0
								? <p className="text-sm text-muted-foreground">No plans match those filters.</p>
								: (
									<div className="overflow-x-auto">
										<Table className="[&_th]:pr-4 [&_td]:pr-4 [&_td]:py-2.5">
											<TableHeader>
												<TableRow>
													<TableHead>Plan</TableHead>
													<TableHead>Name</TableHead>
													<TableHead>Deployment</TableHead>
													<TableHead>Performance</TableHead>
													<TableHead className="text-right">Price</TableHead>
													<TableHead>Term</TableHead>
													<TableHead>Scope</TableHead>
													<TableHead className="w-0 sticky right-0 bg-background" />
												</TableRow>
											</TableHeader>
											<TableBody>
												{filtered.map((plan) => (
													<TableRow key={plan.id} className={plan.status === 'INACTIVE' ? 'opacity-60' : undefined}>
														<TableCell className="font-mono font-medium">
															<span className="inline-flex items-center gap-2">
																{plan.id}
																{plan.status === 'INACTIVE' && (
																	<Badge variant="secondary" className="text-[10px]">Inactive</Badge>
																)}
															</span>
														</TableCell>
														<TableCell className="whitespace-nowrap">{plan.name}</TableCell>
														<TableCell className="whitespace-nowrap">{plan.deploymentDescription}</TableCell>
														<TableCell className="whitespace-nowrap text-muted-foreground">
															{plan.performanceDescription}
														</TableCell>
														<TableCell className="text-right tabular-nums whitespace-nowrap">
															{price.format(plan.priceUsd)}
														</TableCell>
														<TableCell className="whitespace-nowrap text-muted-foreground">{term(plan)}</TableCell>
														<TableCell>
															<RegionScope organizationIds={plan.organizationIds} orgNameById={orgNameById} />
														</TableCell>
														<TableCell className="sticky right-0 bg-background text-right">
															{canWritePlans && (
																<Button
																	variant="ghost"
																	size="icon"
																	aria-label={`Edit ${plan.id}`}
																	onClick={() => setEditing(plan)}
																>
																	<PencilIcon />
																</Button>
															)}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
						</>
					)}
			</div>

			<PlanFormModal open={!!editing} onOpenChange={(next) => !next && setEditing(null)} plan={editing} />
			<PlanFormModal open={creating} onOpenChange={setCreating} />
		</div>
	);
}
