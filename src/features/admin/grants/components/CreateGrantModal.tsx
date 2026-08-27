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
import { CreateGrantSchema, CreateGrantValues, NO_EXPIRY_POLICY } from '@/features/admin/grants/GrantFormSchema';
import { useCreateGrantMutation } from '@/features/admin/grants/mutations/useUpdateGrant';
import { getExpiryPoliciesQueryOptions } from '@/features/admin/grants/queries/getExpiryPolicies';
import { grantsQueryKey } from '@/features/admin/grants/queries/getGrants';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

/** Menu items rendered at once for the org picker, matching the regions form. */
const ORGANIZATION_OPTIONS_RENDERED = 100;

const DEFAULTS: CreateGrantValues = {
	bindTo: 'organization',
	clusterId: '',
	organizationId: '',
	source: 'comp',
	startsAt: '',
	endsAt: '',
	expiryPolicy: NO_EXPIRY_POLICY,
	reason: '',
};

/**
 * Mint a grant. Only the three sources an admin may create — central-manager reserves `purchased`
 * and `enterprise` for the flows that take the money, so offering them here would promise something
 * the server refuses.
 *
 * A grant binds to a cluster now, or to an organization as an unbound voucher that a later cluster
 * creation claims. The server takes exactly one of the two, so the form asks which rather than
 * offering both fields and letting the xor fail server-side.
 */
export function CreateGrantModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const queryClient = useQueryClient();
	const { mutate: create, isPending } = useCreateGrantMutation();
	const { data: policyData } = useQuery({ ...getExpiryPoliciesQueryOptions(), enabled: open });
	const { data: orgResult } = useQuery({ ...getOrganizationsQueryOptions(), enabled: open });

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
		() => [NO_EXPIRY_POLICY, ...Object.keys(policyData?.policies ?? {})],
		[policyData],
	);
	const organizations = (orgResult?.organizations ?? []).slice(0, ORGANIZATION_OPTIONS_RENDERED);

	const bindTo = form.watch('bindTo');
	const source = form.watch('source');
	const isTrial = source === 'trial';

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
			void form.trigger(['endsAt', 'expiryPolicy']);
		}
	}, [source, form]);

	const onSubmit = (values: CreateGrantValues) => {
		create({
			// Exactly one — sending both is refused by the server's xor.
			...(values.bindTo === 'cluster'
				? { clusterId: values.clusterId.trim() }
				: { organizationId: values.organizationId }),
			source: values.source,
			...(values.startsAt ? { startsAt: new Date(values.startsAt).toISOString() } : {}),
			// Omitted means forever, which only gift and comp may be.
			endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
			expiryPolicy: values.expiryPolicy,
			reason: values.reason.trim(),
		}, {
			onSuccess: () => {
				toast.success('Grant created');
				void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
				onOpenChange(false);
			},
			// The server's message is the useful part: it names the missing cluster, the scope
			// violation, or the live grant already on that cluster.
			onError: (error) => toast.error('Could not create the grant', { description: error.message }),
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogTitle>Create grant</DialogTitle>
				<DialogDescription>
					Authorize a cluster to run on terms other than a purchase — a trial, a gift, or a comp.
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
												<Select value={field.value} onValueChange={field.onChange}>
													<SelectTrigger className="w-full" aria-label="Organization">
														<SelectValue placeholder="Choose an organization" />
													</SelectTrigger>
													<SelectContent>
														{organizations.map((org) => (
															<SelectItem key={org.id} value={org.id}>{formatOrgLabel(org.id, org.name)}</SelectItem>
														))}
													</SelectContent>
												</Select>
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

						<FormField
							control={form.control}
							name="source"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Source</FormLabel>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange}>
											<SelectTrigger className="w-full" aria-label="Source">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="comp">comp</SelectItem>
												<SelectItem value="gift">gift</SelectItem>
												<SelectItem value="trial">trial</SelectItem>
											</SelectContent>
										</Select>
									</FormControl>
									<p className="text-xs text-muted-foreground">
										Purchased and enterprise grants are created by the flows that bill for them.
									</p>
								</FormItem>
							)}
						/>

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
													<SelectItem key={policy} value={policy} disabled={isTrial && policy === NO_EXPIRY_POLICY}>
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
