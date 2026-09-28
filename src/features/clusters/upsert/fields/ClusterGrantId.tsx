import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { voucherLabel } from '@/features/clusters/lib/grantExpiry';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { ClusterGrant } from '@/integrations/api/api.patch';
import { CircleHelp } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

/** Radix Select refuses an empty item value, so "no grant" needs a stand-in. Grant ids are cgr-. */
const NONE = 'none';

/**
 * Claim one of the organization's unclaimed grants for the cluster being created. `POST /Cluster`
 * takes `grantId` and binds the grant in place of a payment method.
 *
 * Shown only when there is something to claim — the server scopes the claim to the caller's own
 * organization, so listing them is safe for any member who can create. A scoped grant also sets the
 * plan and regions below it: the request has to match the grant exactly, so the pickers lock rather
 * than let the customer wander into a refusal.
 */
export function ClusterGrantId({
	className,
	form,
	unboundGrants,
	planNameById = {},
	regionNameById = {},
}: {
	className: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	unboundGrants?: ClusterGrant[];
	planNameById?: Record<string, string>;
	regionNameById?: Record<string, string>;
}) {
	const grants = unboundGrants ?? [];
	if (grants.length === 0) { return null; }

	return (
		<FormField
			control={form.control}
			name="grantId"
			render={({ field }) => {
				const picked = grants.find((grant) => grant.id === field.value);
				const scoped = (picked?.shape?.length ?? 0) > 0;
				return (
					<FormItem className={className}>
						<div className="flex items-center gap-1.5 pb-1">
							<FormLabel>Available grants</FormLabel>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="About available grants"
										className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
									>
										<CircleHelp className="size-3.5" aria-hidden="true" />
									</button>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs text-left">
									Trials and complimentary plans your organization has been given. Pick one and this cluster runs on it
									— no payment needed. A complimentary grant fills in its plan and regions for you; a trial lets you
									choose within the plans and regions it covers. Choose None to configure and pay as usual.
								</TooltipContent>
							</Tooltip>
						</div>
						<FormControl>
							<Select
								value={field.value || NONE}
								onValueChange={(value) => {
									field.onChange(value === NONE ? '' : value);
									void form.trigger();
								}}
							>
								<SelectTrigger className="w-full" aria-label="Available grants">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>None</SelectItem>
									{grants.map((grant) => (
										<SelectItem key={grant.id} value={grant.id}>
											{voucherLabel(grant)} <span className="font-light opacity-50">{grant.id}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormControl>
						{picked && <Covers grant={picked} planNameById={planNameById} regionNameById={regionNameById} />}
						{scoped && (
							<p className="text-xs text-muted-foreground">
								This grant sets the plan and regions below. Choose None to pick your own.
							</p>
						)}
						<FormMessage />
					</FormItem>
				);
			}}
		/>
	);
}

/**
 * What a grant covers, in the names the pickers below use. A comp's shape is the exact cluster —
 * each plan with the regions it runs in; a trial's allow-lists are the plans and regions it may use.
 */
function Covers(
	{ grant, planNameById, regionNameById }: {
		grant: ClusterGrant;
		planNameById: Record<string, string>;
		regionNameById: Record<string, string>;
	},
) {
	const planName = (id: string) => planNameById[id] ?? id;
	const regionName = (id: string) => regionNameById[id] ?? id;
	if (grant.shape?.length) {
		const byPlan = new Map<string, string[]>();
		for (const entry of grant.shape) {
			const regions = byPlan.get(entry.planId) ?? [];
			if (entry.regionId != null) { regions.push(regionName(entry.regionId)); }
			byPlan.set(entry.planId, regions);
		}
		const parts = [...byPlan].map(([planId, regions]) =>
			regions.length ? `${planName(planId)} in ${regions.join(', ')}` : `${planName(planId)} (self-hosted)`
		);
		return <p className="text-xs text-muted-foreground">Exactly {parts.join('; ')}</p>;
	}
	const plans = [...new Set(grant.allowedPlanIds ?? [])].map(planName);
	const regions = [...new Set(grant.allowedRegionIds ?? [])].map(regionName);
	if (plans.length === 0 && regions.length === 0) { return null; }
	const scope = [
		plans.length > 0 && plans.join(', '),
		regions.length > 0 && `in ${regions.join(', ')}`,
	].filter(Boolean).join(' ');
	return <p className="text-xs text-muted-foreground">Covers {scope}</p>;
}
