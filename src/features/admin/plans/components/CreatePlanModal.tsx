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
import { useCreatePlanMutation } from '@/features/admin/plans/mutations/useUpsertPlan';
import {
	CreatePlanSchema,
	CreatePlanValues,
	LIMIT_GROUPS,
	RESOURCE_FIELDS,
} from '@/features/admin/plans/PlanFormSchema';
import { plansQueryKey } from '@/features/admin/plans/queries/getPlans';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { FieldPath, useForm, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

/** Menu items rendered at once for the org picker; the filter reaches the rest. */
const ORGANIZATION_OPTIONS_RENDERED = 100;

/**
 * Steppers are dropped: the form is 24 number inputs, and a control that moves a usage limit by 1 is
 * decoration on a field holding hundreds of millions.
 */
const NO_SPINNERS =
	'[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const ZERO_RESOURCES = { storageGb: 0, memoryMb: 0, cpuCores: 0, threads: 0, readIopsLimit: 0, writeIopsLimit: 0 };

const DEFAULTS: CreatePlanValues = {
	id: '',
	name: '',
	status: 'ACTIVE',
	planLevel: 1,
	deploymentType: 'colocated',
	deploymentDescription: '',
	performanceDescription: '',
	priceUsd: 0,
	channel: '',
	stripePriceId: '',
	organizationIds: [],
	resourcesPerInstance: ZERO_RESOURCES,
	planLimits: Object.fromEntries(
		LIMIT_GROUPS.flatMap((group) => group.fields).map((f) => [f.name, f.name === 'expirationMonths' ? 1 : 0]),
	) as CreatePlanValues['planLimits'],
};

/** A number input bound to a nested numeric field, matching the region form's conversion. */
function NumberField(
	{ form, name, label }: { form: UseFormReturn<CreatePlanValues>; name: FieldPath<CreatePlanValues>; label: string },
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
							className={NO_SPINNERS}
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

/**
 * Mint a plan.
 *
 * Creating is the one plan write that is not retroactive: a new plan has no blocks on it, so nothing
 * is re-metered or re-priced and there is no prior value to lose. Editing the definition afterwards
 * is a different matter, which is why the edit modal only offers the three fields that are safe to
 * change live.
 */
export function CreatePlanModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const queryClient = useQueryClient();
	const { mutate: create, isPending } = useCreatePlanMutation();
	const { data: orgResult } = useQuery({ ...getOrganizationsQueryOptions(), enabled: open });

	const form = useForm<CreatePlanValues>({
		resolver: zodResolver(CreatePlanSchema),
		mode: 'onChange',
		defaultValues: DEFAULTS,
	});

	// The modal stays mounted, so a previous draft would otherwise persist into the next open.
	useEffect(() => {
		if (open) { form.reset(DEFAULTS); }
	}, [open, form]);

	const orgOptions = useMemo<MultiSelectOption[]>(
		() =>
			(orgResult?.organizations ?? [])
				.slice(0, ORGANIZATION_OPTIONS_RENDERED)
				.map((o) => ({ value: o.id, label: formatOrgLabel(o.id, o.name) })),
		[orgResult],
	);

	const onSubmit = (values: CreatePlanValues) => {
		create({
			id: values.id.trim(),
			name: values.name.trim(),
			status: values.status,
			planLevel: values.planLevel,
			deploymentType: values.deploymentType,
			deploymentDescription: values.deploymentDescription.trim(),
			performanceDescription: values.performanceDescription.trim(),
			priceUsd: values.priceUsd,
			// Empty means none; the server stores null for both of these.
			channel: values.channel.trim() || null,
			stripePriceId: values.stripePriceId.trim() || null,
			organizationIds: values.organizationIds.length ? values.organizationIds : null,
			resourcesPerInstance: values.resourcesPerInstance,
			planLimits: values.planLimits,
		}, {
			onSuccess: () => {
				toast.success('Plan created');
				void queryClient.invalidateQueries({ queryKey: plansQueryKey });
				onOpenChange(false);
			},
			onError: (error) => toast.error('Could not create the plan', { description: error.message }),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogTitle>Create plan</DialogTitle>
				<DialogDescription>
					What a customer gets and what it costs. A plan created here lives only in this deployment — add it to
					central-manager's <code>src/models/plan.json</code> for it to exist in the others.
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
											<Input placeholder="fabric-block-level-1" {...field} />
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

						<div className="grid grid-cols-3 gap-3">
							<NumberField form={form} name="priceUsd" label="Price (USD per period)" />
							<FormField
								control={form.control}
								name="stripePriceId"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Stripe price</FormLabel>
										<FormControl>
											<Input placeholder="price_…" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="channel"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Channel</FormLabel>
										<FormControl>
											<Input placeholder="Optional" {...field} />
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

						<DialogFooter className="gap-2">
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button type="submit" variant="submit" disabled={isPending || !form.formState.isValid}>
								Create plan
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
