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
import { useCreatePlanMutation, useUpdatePlanMutation } from '@/features/admin/plans/mutations/useUpsertPlan';
import { LIMIT_GROUPS, PlanFormSchema, PlanFormValues, RESOURCE_FIELDS } from '@/features/admin/plans/PlanFormSchema';
import { plansQueryKey } from '@/features/admin/plans/queries/getPlans';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { FieldPath, useForm, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

/** Menu items rendered at once for the org picker; the filter reaches the rest. */
const ORGANIZATION_OPTIONS_RENDERED = 100;

const ZERO_RESOURCES = { storageGb: 0, memoryMb: 0, cpuCores: 0, threads: 0, readIopsLimit: 0, writeIopsLimit: 0 };

function toFormValues(plan?: SchemaPlan | null): PlanFormValues {
	const limits = (plan?.planLimits ?? {}) as Record<string, number | undefined>;
	return {
		id: plan?.id ?? '',
		name: plan?.name ?? '',
		status: plan?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
		planLevel: plan?.planLevel ?? 1,
		deploymentType: (plan?.deploymentType as PlanFormValues['deploymentType']) ?? 'colocated',
		deploymentDescription: plan?.deploymentDescription ?? '',
		performanceDescription: plan?.performanceDescription ?? '',
		priceUsd: plan?.priceUsd ?? 0,
		channel: plan?.channel ?? '',
		organizationIds: plan?.organizationIds ?? [],
		resourcesPerInstance: { ...ZERO_RESOURCES, ...plan?.resourcesPerInstance },
		planLimits: Object.fromEntries(
			LIMIT_GROUPS.flatMap((g) => g.fields).map((
				f,
			) => [f.name, limits[f.name] ?? (f.name === 'expirationMonths' ? 1 : 0)]),
		) as PlanFormValues['planLimits'],
	};
}

/** A number input bound to a nested numeric field, matching the region form's conversion. */
function NumberField(
	{ form, name, label }: { form: UseFormReturn<PlanFormValues>; name: FieldPath<PlanFormValues>; label: string },
) {
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FormItem>
					<FormLabel className="pb-1 text-xs font-normal text-muted-foreground">{label}</FormLabel>
					<FormControl>
						<Input
							type="number"
							min={0}
							name={field.name}
							ref={field.ref}
							onBlur={field.onBlur}
							value={Number.isFinite(field.value as number) ? (field.value as number) : ''}
							onChange={(e) => field.onChange(e.target.valueAsNumber)}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

/** Fields the create/patch schema has no key for — shown so a reader knows they exist, and why not here. */
function ServerOnlyFacts({ plan }: { plan: SchemaPlan }) {
	const facts: Array<[string, string]> = [
		['Stripe price', plan.stripePriceId ?? '—'],
		['Platform price', plan.platformPriceUsd != null ? `$${plan.platformPriceUsd}` : '—'],
		['Allowed regions', plan.allowedRegionIds?.length ? plan.allowedRegionIds.join(', ') : 'any'],
		['Cloud instance types', Object.values(plan.cloudInstanceTypes ?? {}).filter(Boolean).join(', ') || '—'],
	];
	return (
		<div className="rounded-md border p-3">
			<p className="mb-2 text-xs text-muted-foreground">
				Set outside this form — central-manager's plan endpoint has no field for these, and drops them silently rather
				than refusing them.
			</p>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
				{facts.map(([label, value]) => (
					<div key={label} className="contents">
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="truncate font-mono">{value}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

/**
 * Create or edit a plan — the catalogue entry a cluster's region plans point at.
 *
 * Only what PlanAdmin accepts; see PlanFormSchema for what is deliberately absent. `id` is the
 * primary key, so it is set once at create and read-only afterwards.
 */
export function PlanFormModal(
	{ open, onOpenChange, plan }: { open: boolean; onOpenChange: (open: boolean) => void; plan?: SchemaPlan | null },
) {
	const isEdit = !!plan;
	const queryClient = useQueryClient();
	const { mutate: create, isPending: isCreating } = useCreatePlanMutation();
	const { mutate: update, isPending: isUpdating } = useUpdatePlanMutation();
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

	const onSuccess = () => {
		toast.success(isEdit ? 'Plan updated' : 'Plan created');
		void queryClient.invalidateQueries({ queryKey: plansQueryKey });
		onOpenChange(false);
	};
	const onError = (error: Error) =>
		toast.error(isEdit ? 'Could not update the plan' : 'Could not create the plan', { description: error.message });

	const onSubmit = (values: PlanFormValues) => {
		const payload = {
			name: values.name.trim(),
			status: values.status,
			planLevel: values.planLevel,
			deploymentType: values.deploymentType,
			deploymentDescription: values.deploymentDescription.trim(),
			performanceDescription: values.performanceDescription.trim(),
			priceUsd: values.priceUsd,
			// Empty means no channel; the server stores null for that.
			channel: values.channel.trim() || null,
			// Empty means every organization, which the server also stores as null.
			organizationIds: values.organizationIds.length ? values.organizationIds : null,
			resourcesPerInstance: values.resourcesPerInstance,
			planLimits: values.planLimits,
		};

		if (isEdit) {
			// id is left out on purpose: it is the primary key, not a value to write.
			update({ id: plan.id, changes: payload }, { onSuccess, onError });
		} else {
			create({ id: values.id.trim(), ...payload }, { onSuccess, onError });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogTitle>{isEdit ? 'Edit plan' : 'Create plan'}</DialogTitle>
				<DialogDescription>
					What a customer gets and what it costs. Retiring a plan means setting it inactive — plans are never deleted,
					because running clusters still point at them.
				</DialogDescription>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="id"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">ID</FormLabel>
										<FormControl>
											<Input placeholder="fabric-block-level-1" disabled={isEdit} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Name</FormLabel>
										<FormControl>
											<Input placeholder="Fabric Managed Service Block Level 1" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="grid grid-cols-3 gap-3">
							<FormField
								control={form.control}
								name="deploymentType"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Deployment type</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={field.onChange}>
												<SelectTrigger className="w-full" aria-label="Deployment type">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="colocated">colocated</SelectItem>
													<SelectItem value="dedicated">dedicated</SelectItem>
													<SelectItem value="self-hosted">self-hosted</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
									</FormItem>
								)}
							/>
							<NumberField form={form} name="planLevel" label="Plan level" />
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
									</FormItem>
								)}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="deploymentDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Deployment description</FormLabel>
										<FormControl>
											<Input placeholder="Colocated" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">The tier heading the cluster form groups by.</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="performanceDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Performance description</FormLabel>
										<FormControl>
											<Input placeholder="Medium (10K read/min)" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">What the customer picks within that tier.</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<NumberField form={form} name="priceUsd" label="Price (USD per period)" />
							<FormField
								control={form.control}
								name="channel"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Channel</FormLabel>
										<FormControl>
											<Input placeholder="Leave empty for none" {...field} />
										</FormControl>
										<FormMessage />
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
							<legend className="px-1 text-sm font-medium">Per instance</legend>
							<div className="grid grid-cols-3 gap-3">
								{RESOURCE_FIELDS.map((f) => (
									<NumberField key={f.name} form={form} name={`resourcesPerInstance.${f.name}`} label={f.label} />
								))}
							</div>
						</fieldset>

						<fieldset className="rounded-md border p-3">
							<legend className="px-1 text-sm font-medium">Usage block</legend>
							<div className="flex flex-col gap-3">
								{LIMIT_GROUPS.map((group) => (
									<div key={group.heading}>
										<p className="mb-1 text-xs font-medium text-muted-foreground">{group.heading}</p>
										<div className="grid grid-cols-4 gap-3">
											{group.fields.map((f) => (
												<NumberField key={f.name} form={form} name={`planLimits.${f.name}`} label={f.label} />
											))}
										</div>
									</div>
								))}
							</div>
						</fieldset>

						{plan && <ServerOnlyFacts plan={plan} />}

						<DialogFooter className="gap-2">
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button type="submit" variant="submit" disabled={isCreating || isUpdating || !form.formState.isValid}>
								{isEdit ? 'Save changes' : 'Create plan'}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
