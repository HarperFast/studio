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
import { GrantScopeFields } from '@/features/admin/grants/components/GrantScopeFields';
import { GrantShapeFields } from '@/features/admin/grants/components/GrantShapeFields';
import { OrganizationPicker } from '@/features/admin/grants/components/OrganizationPicker';
import {
	compedExpiryPolicy,
	CreateGrantSchema,
	CreateGrantValues,
	INTERNAL_EXPIRY_POLICIES,
	MAX_GRANT_QUANTITY,
	NO_EXPIRY_POLICY,
} from '@/features/admin/grants/GrantFormSchema';
import { useCreateGrantMutation } from '@/features/admin/grants/mutations/useUpdateGrant';
import { getExpiryPoliciesQueryOptions } from '@/features/admin/grants/queries/getExpiryPolicies';
import { grantsQueryKey } from '@/features/admin/grants/queries/getGrants';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

const DEFAULTS: CreateGrantValues = {
	bindTo: 'organization',
	clusterId: '',
	organizationId: '',
	quantity: '1',
	source: 'comped',
	startsAt: '',
	endsAt: '',
	expiryPolicy: NO_EXPIRY_POLICY,
	shape: [],
	allowedPlanIds: [],
	allowedRegionIds: [],
	reason: '',
};

/**
 * Mint a grant. Only the two sources an admin may create — central-manager derives `purchased`,
 * `contracted` and `free` from the flows that own them, so offering them here would promise something
 * the server refuses.
 *
 * A grant binds to a cluster now, or to an organization as an unbound voucher that a later cluster
 * creation claims. The server takes exactly one of the two, so the form asks which rather than
 * offering both fields and letting the xor fail server-side.
 */
export function CreateGrantModal({ open, onOpenChange, onCreated }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Handed the created grants — one, or an unbound batch — so the caller can show their server-generated ids. */
	onCreated: (grants: AdminClusterGrant[]) => void;
}) {
	const queryClient = useQueryClient();
	const { mutate: create, isPending } = useCreateGrantMutation();
	// isPending disables the button a tick after the click; a second submit in that tick mints twice.
	const inFlight = useRef(false);
	const { data: policyData } = useQuery({ ...getExpiryPoliciesQueryOptions(), enabled: open });

	const form = useForm<CreateGrantValues>({
		resolver: zodResolver(CreateGrantSchema),
		mode: 'onChange',
		defaultValues: DEFAULTS,
	});

	// The modal stays mounted, so a previous draft would otherwise persist into the next open.
	useEffect(() => {
		if (open) { form.reset(DEFAULTS); }
	}, [open, form]);

	const policies = useMemo(
		() => [
			NO_EXPIRY_POLICY,
			...Object.keys(policyData?.policies ?? {}).filter((policy) => !INTERNAL_EXPIRY_POLICIES.includes(policy)),
		],
		[policyData],
	);

	const bindTo = form.watch('bindTo');
	const source = form.watch('source');
	const isTrial = source === 'trial';
	const isComped = source === 'comped';
	const endsAt = form.watch('endsAt');

	// react-hook-form computes isValid from the whole schema but only surfaces errors for fields the
	// user has touched — and a Radix Select never marks one touched, since that happens on blur and
	// it only fires change. Both fields below carry rules that depend on `source`, so without this,
	// choosing `trial` disables the submit button with nothing on screen explaining why.
	//
	// Keyed on the transition rather than the value, so a freshly opened form does not open covered
	// in errors for fields nobody has filled in yet.
	const previousSource = useRef(source);
	useEffect(() => {
		if (previousSource.current !== source) {
			previousSource.current = source;
			void form.trigger(['endsAt', 'expiryPolicy', 'shape', 'allowedPlanIds', 'allowedRegionIds']);
		}
	}, [source, form]);

	// Ends decides which policy a comped grant may carry, so changing it re-checks the policy too:
	// otherwise submit disables with the reason hidden under a select that never counts as touched.
	const previousEndsAt = useRef(endsAt);
	useEffect(() => {
		if (previousEndsAt.current !== endsAt) {
			previousEndsAt.current = endsAt;
			void form.trigger('expiryPolicy');
		}
	}, [endsAt, form]);

	const onSubmit = (values: CreateGrantValues) => {
		const body = {
			// Exactly one — sending both is refused by the server's xor.
			...(values.bindTo === 'cluster'
				? { clusterId: values.clusterId.trim() }
				: {
					organizationId: values.organizationId,
					// Sent only for a real batch: one grant keeps the single-grant request and response.
					...(Number(values.quantity) > 1 ? { quantity: Number(values.quantity) } : {}),
				}),
			source: values.source,
			...(values.startsAt ? { startsAt: new Date(values.startsAt).toISOString() } : {}),
			// Omitted means forever, which only a comped grant may be.
			endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
			expiryPolicy: values.expiryPolicy,
			// A comp carries its shape and nothing else; the server refuses the allow-lists on it. For
			// a trial an empty list is refused too; null — omitted here — is "any".
			...(values.source === 'comped'
				? { shape: values.shape.map((row) => ({ planId: row.planId, regionId: row.regionId || null })) }
				: {
					...(values.allowedPlanIds.length ? { allowedPlanIds: values.allowedPlanIds } : {}),
					...(values.allowedRegionIds.length ? { allowedRegionIds: values.allowedRegionIds } : {}),
				}),
			reason: values.reason.trim(),
		};
		// Taken after the body is built: a throw above must not leave the latch closed.
		if (inFlight.current) { return; }
		inFlight.current = true;
		create(body, {
			onSuccess: (grants) => {
				void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
				onOpenChange(false);
				// No toast: the ids are generated server-side and are the only handle on an unbound
				// grant, so they are handed over in a dialog the reader can copy from.
				if (grants.length > 0) {
					onCreated(grants);
				} else {
					// It did succeed: saying nothing, or an error, would invite a second batch.
					toast.success('Grant created', { description: 'No ids came back; find them in the grants list.' });
				}
			},
			// The server's message is the useful part: it names the missing cluster, the scope
			// violation, or the live grant already on that cluster.
			onError: (error) => toast.error('Could not create the grant', { description: describeError(error).message }),
			onSettled: () => {
				inFlight.current = false;
			},
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogTitle>Create grant</DialogTitle>
				<DialogDescription>
					Authorize a cluster to run on terms other than a purchase — a trial, or a comp scoped to the plans and regions
					it covers.
				</DialogDescription>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
						<FormField
							control={form.control}
							name="bindTo"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Applies to</FormLabel>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger className="w-full" aria-label="Applies to">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="organization">An organization (unbound voucher)</SelectItem>
												<SelectItem value="cluster">An existing cluster</SelectItem>
											</SelectContent>
										</Select>
									</FormControl>
									<p className="text-xs text-muted-foreground">
										{field.value === 'organization'
											? 'Held unbound until the organization creates a cluster, which claims it.'
											: 'Applies immediately. The cluster must not already have a live grant.'}
									</p>
								</FormItem>
							)}
						/>

						{bindTo === 'organization'
							? (
								<FormField
									control={form.control}
									name="organizationId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Organization</FormLabel>
											<FormControl>
												<OrganizationPicker value={field.value} onChange={field.onChange} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)
							: (
								<FormField
									control={form.control}
									name="clusterId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Cluster</FormLabel>
											<FormControl>
												<Input placeholder="clu-…" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

						<div className="flex items-start gap-3">
							{bindTo === 'organization' && (
								<FormField
									control={form.control}
									name="quantity"
									render={({ field }) => (
										<FormItem className="w-24 shrink-0">
											<FormLabel>Quantity</FormLabel>
											<FormControl>
												<Input type="number" inputMode="numeric" min={1} max={MAX_GRANT_QUANTITY} {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
							<FormField
								control={form.control}
								name="source"
								render={({ field }) => (
									<FormItem className="min-w-0 flex-1">
										<FormLabel>Source</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={field.onChange}>
												<SelectTrigger className="w-full" aria-label="Source">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="comped">comped</SelectItem>
													<SelectItem value="trial">trial</SelectItem>
												</SelectContent>
											</Select>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Purchased, contracted and free grants are derived by the flows that own them.
										</p>
									</FormItem>
								)}
							/>
						</div>
						{bindTo === 'organization' && (
							<p className="-mt-2 text-xs text-muted-foreground">
								Quantity mints identical vouchers, claimed one each as this organization creates clusters.
							</p>
						)}

						<div className="grid grid-cols-2 gap-3">
							<FormField
								control={form.control}
								name="startsAt"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Starts</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">Empty starts now.</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="endsAt"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Ends</FormLabel>
										<FormControl>
											<Input type="datetime-local" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											{isTrial ? 'Required for a trial.' : 'Empty never expires.'}
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="expiryPolicy"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Expiry policy</FormLabel>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger className="w-full" aria-label="Expiry policy">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{policies.map((policy) => (
													<SelectItem
														key={policy}
														value={policy}
														// A trial always stages; a comped grant has exactly one valid policy.
														disabled={isTrial
															? policy === NO_EXPIRY_POLICY
															: isComped && policy !== compedExpiryPolicy(endsAt ?? '')}
													>
														{policy}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{isComped ? <GrantShapeFields enabled={open} /> : <GrantScopeFields enabled={open} />}

						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reason</FormLabel>
									<FormControl>
										<Input placeholder="Why this grant exists" {...field} />
									</FormControl>
									<p className="text-xs text-muted-foreground">Recorded on the grant and shown in the list.</p>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className="gap-2">
							<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
							<Button type="submit" variant="submit" disabled={isPending || !form.formState.isValid}>
								Create grant
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
