import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { INTERNAL_EXPIRY_POLICIES } from '@/features/admin/grants/GrantFormSchema';
import { getExpiryPoliciesQueryOptions } from '@/features/admin/grants/queries/getExpiryPolicies';
import { AdminExpiryPolicyStage } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * What each expiry policy actually schedules, as central-manager runs it — context for the Stage
 * and Next-due columns above, not a page of its own. Everything here is served: studio encodes no
 * offsets, no stage lists, and not even which actions count as destructive.
 */

/** `daysFromEnd` is measured from the grant's endsAt; negative = before it. */
function offsetLabel(stage: AdminExpiryPolicyStage): string {
	if (stage.daysFromEnd === 0) { return 'at end'; }
	if (stage.daysFromEnd < 0) { return `${-stage.daysFromEnd}d before end`; }
	return `+${stage.daysFromEnd}d after end`;
}

export function ExpiryPolicyPanel() {
	const [open, setOpen] = useState(false);
	// Fetched only once opened: reference data most visits never need.
	const { data, isLoading, isError } = useQuery({ ...getExpiryPoliciesQueryOptions(), enabled: open });

	return (
		<div className="rounded-lg border">
			<Button
				variant="ghost"
				className="w-full justify-start gap-2"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<ChevronDownIcon className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
				Expiry policies — what each stage schedules
			</Button>

			{open && (
				<div className="flex flex-col gap-4 p-4 pt-1">
					{isLoading && <p className="text-sm text-muted-foreground">Loading policies…</p>}
					{isError && (
						<p className="text-sm text-destructive">
							Could not load the policy tables. You need <code>grant:read</code> to view them.
						</p>
					)}
					{/* conversion-pending is excluded: central-manager mints and clears it on its own. */}
					{data
						&& Object.entries(data.policies)
							.filter(([policy]) => !INTERNAL_EXPIRY_POLICIES.includes(policy))
							.map(([policy, stages]) => (
								<div key={policy}>
									<h3 className="font-mono text-sm font-semibold mb-1.5">{policy}</h3>
									<ol className="flex flex-wrap items-center gap-1.5">
										{stages.map((stage, index) => (
											<li key={stage.stage} className="flex items-center gap-1.5">
												{index > 0 && <span className="text-muted-foreground">→</span>}
												<Badge
													variant={stage.destructive ? 'destructive' : 'secondary'}
													title={stage.actions.join(', ')}
												>
													{stage.stage} · {offsetLabel(stage)}
													{stage.orUsagePct != null && ` · or ${stage.orUsagePct}% usage`}
												</Badge>
											</li>
										))}
									</ol>
								</div>
							))}
					{data && (
						<p className="text-xs font-light text-muted-foreground">
							Red stages stop or delete the cluster. These tables are code in central-manager
							{data.editableAtRuntime === false && ' and cannot be edited at runtime'}; editing them there moves every
							date shown above.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
