import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect, MultiSelectOption } from '@/features/admin/components/MultiSelect';
import { useUpdatePlanMutation } from '@/features/admin/plans/mutations/useUpsertPlan';
import {
	LIMIT_GROUPS,
	PlanFormSchema,
	PlanFormValues,
	refusedAsUnbillable,
	RESOURCE_FIELDS,
	UNBILLABLE_MESSAGE,
} from '@/features/admin/plans/PlanFormSchema';
import { plansQueryKey } from '@/features/admin/plans/queries/getPlans';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

/** Menu items rendered at once for the org picker; the filter reaches the rest. */
const ORGANIZATION_OPTIONS_RENDERED = 100;

const number = new Intl.NumberFormat();

function toFormValues(plan?: SchemaPlan | null): PlanFormValues {
	return {
		status: plan?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
		organizationIds: plan?.organizationIds ?? [],
		stripePriceId: plan?.stripePriceId ?? '',
	};
}

/** A definition value, shown rather than edited. */
function Fact({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="truncate tabular-nums">{value}</dd>
		</div>
	);
}

/**
 * Edit the three plan fields that are safe to change live.
 *
 * The rest of the plan is shown but not editable — see PlanFormSchema for why: limits and price are
 * applied retroactively to every live block, the table keeps no audit history, and the seed never
 * reconciles a hand edit back to plan.json. Those changes belong in a reviewed diff.
 */
export function PlanFormModal(
	{ open, onOpenChange, plan }: { open: boolean; onOpenChange: (open: boolean) => void; plan?: SchemaPlan | null },
) {
	const queryClient = useQueryClient();
	const { mutate: update, isPending } = useUpdatePlanMutation();
	const { data: orgResult } = useQuery({ ...getOrganizationsQueryOptions(), enabled: open });

	const form = useForm<PlanFormValues>({
		resolver: zodResolver(PlanFormSchema),
		mode: 'onChange',
		defaultValues: toFormValues(plan),
	});

	// The modal stays mounted between openings, so state has to be reset to the plan being edited.
	useEffect(() => {
		if (open) { form.reset(toFormValues(plan)); }
	}, [open, plan, form]);

	const orgOptions = useMemo<MultiSelectOption[]>(
		() =>
			(orgResult?.organizations ?? [])
				.slice(0, ORGANIZATION_OPTIONS_RENDERED)
				.map((o) => ({ value: o.id, label: formatOrgLabel(o.id, o.name) })),
		[orgResult],
	);

	// Only what actually changed is sent. Re-stating an untouched value is not free here: the server
	// assesses billability whenever a patch carries `status` or `stripePriceId`, so a scoping-only
	// edit that also restated those two would be refused on an already-unbillable plan — losing the
	// one mitigation that edit exists to perform.
	const initial = toFormValues(plan);
	const values = form.watch();
	const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
	const changed = {
		status: values.status !== initial.status,
		organizationIds: !sameIds(values.organizationIds ?? [], initial.organizationIds),
		stripePriceId: (values.stripePriceId ?? '').trim() !== initial.stripePriceId,
	};

	const unbillable = refusedAsUnbillable({
		touchesStatusOrPrice: changed.status || changed.stripePriceId,
		priceUsd: plan?.priceUsd ?? 0,
		status: values.status,
		stripePriceId: (values.stripePriceId ?? '').trim(),
	});

	const limits = (plan?.planLimits ?? {}) as Record<string, number | undefined>;
	const resources = (plan?.resourcesPerInstance ?? {}) as Record<string, number | undefined>;
	const show = (value: number | undefined) => (value == null ? '—' : number.format(value));

	const onSubmit = (submitted: PlanFormValues) => {
		if (!plan) { return; }
		update({
			id: plan.id,
			changes: {
				...(changed.status ? { status: submitted.status } : {}),
				// Empty means every organization, which the server stores as null.
				...(changed.organizationIds
					? { organizationIds: submitted.organizationIds.length ? submitted.organizationIds : null }
					: {}),
				...(changed.stripePriceId ? { stripePriceId: submitted.stripePriceId.trim() || null } : {}),
			},
		}, {
			onSuccess: () => {
				toast.success('Plan updated');
				void queryClient.invalidateQueries({ queryKey: plansQueryKey });
				onOpenChange(false);
			},
			onError: (error) => toast.error('Could not update the plan', { description: error.message }),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogTitle>Edit plan</DialogTitle>
				<DialogDescription>
					<span className="font-mono">{plan?.id}</span> — {plan?.name}
				</DialogDescription>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="status"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Status</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={field.onChange}>
												<SelectTrigger className="w-full" aria-label="Status">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="ACTIVE">ACTIVE</SelectItem>
													<SelectItem value="INACTIVE">INACTIVE — retired</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Retiring hides the plan from new provisioning. Clusters already on it keep running.
										</p>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="stripePriceId"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Stripe price</FormLabel>
										<FormControl>
											<Input placeholder="price_…" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Without this, blocks on a paid plan invoice for nothing.
										</p>
										{unbillable ? <p className="text-xs text-destructive">{UNBILLABLE_MESSAGE}</p> : <FormMessage />}
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="organizationIds"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Organizations</FormLabel>
									<MultiSelect
										ariaLabel="Organizations"
										options={orgOptions}
										selected={field.value}
										onChange={field.onChange}
										placeholder="Every organization"
										emptyText="No organizations"
									/>
								</FormItem>
							)}
						/>

						<fieldset className="rounded-md border p-3">
							<legend className="px-1 text-sm font-medium">Definition</legend>
							<p className="mb-3 text-xs text-muted-foreground">
								Read-only here. Limits and price are applied to every live block on this plan the moment they change,
								and a hand edit is never reconciled back — so they are changed in central-manager's{' '}
								<code>src/models/plan.json</code> through a reviewed pull request.
							</p>
							<dl className="grid gap-x-8 gap-y-1 text-xs md:grid-cols-2">
								<Fact label="Price (USD per period)" value={show(plan?.priceUsd)} />
								<Fact label="Plan level" value={show(plan?.planLevel)} />
								<Fact
									label="Deployment"
									value={`${plan?.deploymentDescription ?? '—'} (${plan?.deploymentType ?? '—'})`}
								/>
								<Fact label="Performance" value={plan?.performanceDescription ?? '—'} />
								<Fact label="Channel" value={plan?.channel ?? '—'} />
								<Fact
									label="Platform price"
									value={plan?.platformPriceUsd != null ? show(plan.platformPriceUsd) : '—'}
								/>
							</dl>

							<p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">Per instance</p>
							<dl className="grid gap-x-8 gap-y-1 text-xs md:grid-cols-3">
								{RESOURCE_FIELDS.map((f) => <Fact key={f.name} label={f.label} value={show(resources[f.name])} />)}
							</dl>

							{LIMIT_GROUPS.map((group) => (
								<div key={group.heading}>
									<p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">{group.heading}</p>
									<dl className="grid gap-x-8 gap-y-1 text-xs md:grid-cols-2">
										{group.fields.map((f) => <Fact key={f.name} label={f.label} value={show(limits[f.name])} />)}
									</dl>
								</div>
							))}
						</fieldset>

						<DialogFooter className="gap-2">
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button
								type="submit"
								variant="submit"
								disabled={isPending || !form.formState.isValid || unbillable
									|| !(changed.status || changed.organizationIds || changed.stripePriceId)}
							>
								Save changes
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
