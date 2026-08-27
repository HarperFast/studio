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
import { GrantFormSchema, GrantFormValues, NO_EXPIRY_POLICY } from '@/features/admin/grants/GrantFormSchema';
import { useUpdateGrantMutation } from '@/features/admin/grants/mutations/useUpdateGrant';
import { getExpiryPoliciesQueryOptions } from '@/features/admin/grants/queries/getExpiryPolicies';
import { grantsQueryKey } from '@/features/admin/grants/queries/getGrants';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface GrantFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	grant: AdminClusterGrant | null;
}

/** `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` in local time, not an ISO instant. */
function toLocalInput(iso: string | null | undefined): string {
	if (!iso) { return ''; }
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) { return ''; }
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${
		pad(at.getMinutes())
	}`;
}

function toFormValues(grant: AdminClusterGrant | null): GrantFormValues {
	return {
		endsAt: toLocalInput(grant?.endsAt),
		expiryPolicy: grant?.expiryPolicy ?? NO_EXPIRY_POLICY,
		allowedPlanIds: grant?.allowedPlanIds ?? [],
		allowedRegionIds: grant?.allowedRegionIds ?? [],
		reason: '',
	};
}

/**
 * Edit an active grant's terms. Only the fields central-manager will accept: `source` and
 * `clusterId` are immutable, and reactivation does not exist — those mean minting a new grant.
 *
 * Revoking lives here too, as a separate action rather than a status field, because it is not a
 * value you set: it ends the grant, is exempt from the guards that protect the others, and cannot
 * be undone.
 */
export function GrantFormModal({ open, onOpenChange, grant }: GrantFormModalProps) {
	const queryClient = useQueryClient();
	const { mutate: update, isPending } = useUpdateGrantMutation();
	const { data: policyData } = useQuery({ ...getExpiryPoliciesQueryOptions(), enabled: open });

	const form = useForm<GrantFormValues>({
		resolver: zodResolver(GrantFormSchema),
		mode: 'onChange',
		defaultValues: toFormValues(grant),
	});

	// The modal stays mounted between openings, so its state has to be reset to the grant being
	// edited — otherwise the previous grant's terms (and its reason) persist into the next edit.
	useEffect(() => {
		if (open) { form.reset(toFormValues(grant)); }
	}, [open, grant, form]);

	// Offered policies come from the server's own tables, so a new policy needs no studio change.
	const policies = useMemo(
		() => [NO_EXPIRY_POLICY, ...Object.keys(policyData?.policies ?? {})],
		[policyData],
	);

	// A trial must stay time-boxed and stageable: the server refuses clearing its endsAt or setting
	// its policy to none, so the form says so rather than letting the reader earn a 400.
	const isTrial = grant?.source === 'trial';

	const onSuccess = (message: string) => () => {
		toast.success(message);
		void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
		onOpenChange(false);
	};
	const onError = (error: Error) => toast.error('Could not update the grant', { description: error.message });

	const onSubmit = (values: GrantFormValues) => {
		if (!grant) { return; }
		update({
			id: grant.id,
			changes: {
				endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null,
				expiryPolicy: values.expiryPolicy,
				// An empty list is refused by the server; null is how a scope is cleared.
				allowedPlanIds: values.allowedPlanIds.length ? values.allowedPlanIds : null,
				allowedRegionIds: values.allowedRegionIds.length ? values.allowedRegionIds : null,
				reason: values.reason.trim(),
			},
		}, { onSuccess: onSuccess('Grant updated'), onError });
	};

	const onRevoke = () => {
		const reason = form.getValues('reason').trim();
		if (!reason) {
			form.setError('reason', { message: 'A reason is required to revoke' });
			return;
		}
		if (!grant) { return; }
		update(
			{ id: grant.id, changes: { status: 'REVOKED', reason } },
			{ onSuccess: onSuccess('Grant revoked'), onError },
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogTitle>Edit grant</DialogTitle>
				<DialogDescription>
					{grant?.id} · {grant?.source}
					{grant?.clusterId ? ` · ${grant.clusterId}` : ' · unbound voucher'}
				</DialogDescription>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
										{isTrial
											? 'A trial must stay time-boxed — this cannot be cleared.'
											: 'Leave empty for a grant that never expires.'}
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>

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
														// A trial requires a staged policy; the server refuses `none` for one.
														disabled={isTrial && policy === NO_EXPIRY_POLICY}
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

						<FormField
							control={form.control}
							name="reason"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reason</FormLabel>
									<FormControl>
										<Input placeholder="Why these terms are changing" {...field} />
									</FormControl>
									<p className="text-xs text-muted-foreground">
										Recorded on the grant and shown in the list. Required for every change.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter className="gap-2 sm:justify-between">
							{
								/* Revoke is not a value you set — it ends the grant, is exempt from the guards
							    protecting the other fields, and cannot be undone, so it is its own action. */
							}
							<Button type="button" variant="destructive" disabled={isPending} onClick={onRevoke}>
								Revoke grant
							</Button>
							<div className="flex gap-2">
								<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
								<Button type="submit" variant="submit" disabled={isPending || !form.formState.isValid}>
									Save changes
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
