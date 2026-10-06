import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
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
import {
	compedExpiryPolicy,
	GrantFormSchema,
	GrantFormValues,
	INTERNAL_EXPIRY_POLICIES,
	NO_EXPIRY_POLICY,
	ShapeRow,
} from '@/features/admin/grants/GrantFormSchema';
import { narrowsScope } from '@/features/admin/grants/lib/grantScopeRules';
import { useSwitchToPaidMutation } from '@/features/admin/grants/mutations/useSwitchToPaid';
import { useUpdateGrantMutation } from '@/features/admin/grants/mutations/useUpdateGrant';
import { getExpiryPoliciesQueryOptions } from '@/features/admin/grants/queries/getExpiryPolicies';
import { grantsQueryKey } from '@/features/admin/grants/queries/getGrants';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface GrantFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	grant: AdminClusterGrant | null;
	/** Whether the viewer holds billing:write, which switching to paid needs because it charges the card. */
	canBill?: boolean;
	onReplaceWithComp?: (grant: AdminClusterGrant, reason: string) => void;
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

/** Order is not meaningful in a scope, so a reordered pick is not a change worth sending. */
function sameIds(next: string[], before: string[]): boolean {
	return next.length === before.length && [...next].sort().join() === [...before].sort().join();
}

/** A 402 means the organization has no usable card; that comes before the server's wording. */
function switchToPaidError(error: Error): string {
	const { message } = describeError(error);
	const status = (error as { response?: { status?: number } }).response?.status;
	return status === 402 ? `The organization has no valid card on file. ${message}` : message;
}

/** The server compares shapes as multisets of (plan, region), so order is not a change either. */
function sameShape(next: ShapeRow[], before: ShapeRow[]): boolean {
	const keys = (rows: ShapeRow[]) => rows.map((row) => `${row.planId}@${row.regionId || '-'}`).sort().join();
	return next.length === before.length && keys(next) === keys(before);
}

function toFormValues(grant: AdminClusterGrant | null): GrantFormValues {
	return {
		endsAt: toLocalInput(grant?.endsAt),
		expiryPolicy: grant?.expiryPolicy ?? NO_EXPIRY_POLICY,
		cadence: grant?.cadence ?? 'anniversary',
		shape: (grant?.shape ?? []).map((entry) => ({ planId: entry.planId, regionId: entry.regionId ?? '' })),
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
export function GrantFormModal(
	{ open, onOpenChange, grant, canBill = false, onReplaceWithComp }: GrantFormModalProps,
) {
	const queryClient = useQueryClient();
	const { mutate: update, isPending: updating } = useUpdateGrantMutation();
	const { mutate: switchToPaid, isPending: switching } = useSwitchToPaidMutation();
	const isPending = updating || switching;
	const [confirmingPaid, setConfirmingPaid] = useState(false);
	// isPending disables the buttons a tick after the click; revoke is irreversible, so the guard
	// has to hold from the click itself.
	const inFlight = useRef(false);
	const release = () => {
		inFlight.current = false;
	};
	const { data: policyData } = useQuery({ ...getExpiryPoliciesQueryOptions(), enabled: open });

	const form = useForm<GrantFormValues>({
		resolver: zodResolver(GrantFormSchema),
		mode: 'onChange',
		defaultValues: toFormValues(grant),
	});

	// The modal stays mounted between openings, so its state has to be reset to the grant being
	// edited — otherwise the previous grant's terms (and its reason) persist into the next edit.
	useEffect(() => {
		if (open) {
			form.reset(toFormValues(grant));
			setConfirmingPaid(false);
		}
	}, [open, grant, form]);

	// Offered policies come from the server's own tables, so a new policy needs no studio change.
	// A conversion in flight legitimately carries an internal policy: keep the grant's own value in
	// the list, unpickable, so the trigger shows what it has instead of rendering blank.
	const policies = useMemo(() => {
		const offered = [
			NO_EXPIRY_POLICY,
			...Object.keys(policyData?.policies ?? {}).filter((policy) => !INTERNAL_EXPIRY_POLICIES.includes(policy)),
		];
		const current = grant?.expiryPolicy;
		return current && !offered.includes(current) ? [...offered, current] : offered;
	}, [policyData, grant]);

	// A trial must stay time-boxed and stageable: the server refuses clearing its endsAt or setting
	// its policy to none, so the form says so rather than letting the reader earn a 400.
	const isTrial = grant?.source === 'trial';
	// A comp's shape is the cluster it was for. Once bound, the server refuses any change to it
	// (409) — the right move is a replacement — so the editor locks rather than invites a save.
	const isComped = grant?.source === 'comped';
	const boundComp = isComped && grant?.clusterId != null;
	// The edit form carries no source, so the schema's comped rule never runs here. Only once Ends is
	// edited: a save that changes nothing else must not restate the stored policy.
	const endsAt = form.watch('endsAt');
	useEffect(() => {
		if (!isComped) { return; }
		const initial = toFormValues(grant);
		const policy = endsAt === initial.endsAt ? initial.expiryPolicy : compedExpiryPolicy(endsAt ?? '');
		if (form.getValues('expiryPolicy') !== policy) { form.setValue('expiryPolicy', policy, { shouldValidate: true }); }
	}, [isComped, endsAt, grant, form]);
	// Only a contract moves a renewal to the 1st; the server refuses a cadence on any other source.
	const isContracted = grant?.source === 'contracted';
	// A switchover replaces the cluster's live grant without stopping it: never an unbound voucher, nor a
	// lapsed or not-yet-started grant, which the server refuses as not the live one.
	const bound = grant?.clusterId != null;
	const switchable = bound && grant?.isActive !== false;
	// It charges a card, so it is offered only with billing:write.
	const canSwitchToPaid = switchable && canBill && grant?.source !== 'purchased';

	// A bound grant's scope may only widen (409 otherwise). GrantScopeFields says which field and
	// why; the button is held so the save can't be attempted from here either.
	const narrowsBoundScope = !isComped && grant?.clusterId != null
		&& (narrowsScope(grant.allowedPlanIds, form.watch('allowedPlanIds'))
			|| narrowsScope(grant.allowedRegionIds, form.watch('allowedRegionIds')));

	const onSuccess = (message: string) => () => {
		toast.success(message);
		void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
		onOpenChange(false);
	};
	const onError = (error: Error) =>
		toast.error('Could not update the grant', { description: describeError(error).message });

	// Only what actually changed is sent. Re-stating an untouched value is not free: the server
	// refuses an internal expiryPolicy outright, and reads any scope it receives through the
	// widen-only guard, so an unedited field would fail a save that changed something else.
	const onSubmit = (values: GrantFormValues) => {
		if (!grant) { return; }
		// Compared against the form's own view of the grant, not the stored record: a datetime-local
		// input holds no seconds, so an untouched end date read back as an instant differs from the
		// stored one and would silently truncate it to the minute.
		const initial = toFormValues(grant);
		// An empty list is refused by the server; null is how a scope is cleared.
		const asScope = (ids: string[]) => (ids.length ? ids : null);

		const changes = {
			...(values.endsAt !== initial.endsAt
				? { endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null }
				: {}),
			...(values.expiryPolicy !== initial.expiryPolicy ? { expiryPolicy: values.expiryPolicy } : {}),
			...(values.cadence !== initial.cadence ? { cadence: values.cadence } : {}),
			...(sameIds(values.allowedPlanIds, initial.allowedPlanIds)
				? {}
				: { allowedPlanIds: asScope(values.allowedPlanIds) }),
			...(sameIds(values.allowedRegionIds, initial.allowedRegionIds)
				? {}
				: { allowedRegionIds: asScope(values.allowedRegionIds) }),
			...(sameShape(values.shape, initial.shape)
				? {}
				: { shape: values.shape.map((row) => ({ planId: row.planId, regionId: row.regionId || null })) }),
			reason: values.reason.trim(),
		};
		// Taken last, after the body is built and every bail: a refusal or a throw above must leave the
		// latch open, or one failed save would dead-lock both buttons until the modal remounts.
		if (inFlight.current) { return; }
		inFlight.current = true;
		update({ id: grant.id, changes }, { onSuccess: onSuccess('Grant updated'), onError, onSettled: release });
	};

	const onReplace = () => {
		if (inFlight.current) { return; }
		if (grant && onReplaceWithComp) { onReplaceWithComp(grant, form.getValues('reason').trim()); }
	};

	const onSwitchToPaid = async () => {
		if (!form.getValues('reason').trim()) {
			form.setError('reason', { message: 'A reason is required to switch to paid' });
			return;
		}
		if (!(await form.trigger('reason'))) { return; }
		setConfirmingPaid(true);
	};

	const confirmSwitchToPaid = () => {
		if (!grant?.clusterId) { return; }
		if (inFlight.current) { return; }
		inFlight.current = true;
		switchToPaid(
			{ clusterId: grant.clusterId, replaceGrantId: grant.id, reason: form.getValues('reason').trim() },
			{
				onSuccess: (result) => {
					toast.success('Switched to paid', { description: `New grant ${result.id}` });
					void queryClient.invalidateQueries({ queryKey: grantsQueryKey });
					setConfirmingPaid(false);
					onOpenChange(false);
				},
				onError: (error) => {
					setConfirmingPaid(false);
					toast.error('Could not switch to paid', { description: switchToPaidError(error) });
				},
				onSettled: release,
			},
		);
	};

	const onRevoke = () => {
		const reason = form.getValues('reason').trim();
		if (!reason) {
			form.setError('reason', { message: 'A reason is required to revoke' });
			return;
		}
		if (!grant) { return; }
		if (inFlight.current) { return; }
		inFlight.current = true;
		update(
			{ id: grant.id, changes: { status: 'REVOKED', reason } },
			{ onSuccess: onSuccess('Grant revoked'), onError, onSettled: release },
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
										<Select value={field.value} onValueChange={field.onChange} disabled={isComped}>
											<SelectTrigger className="w-full" aria-label="Expiry policy">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{policies.map((policy) => (
													<SelectItem
														key={policy}
														value={policy}
														// A trial requires a staged policy; the server refuses `none` for one, and
														// central-manager refuses every internal policy from an admin outright.
														disabled={(isTrial && policy === NO_EXPIRY_POLICY)
															|| INTERNAL_EXPIRY_POLICIES.includes(policy)}
													>
														{policy}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormControl>
									{isComped && (
										<p className="text-xs text-muted-foreground">Set by the end date: comped with one, none without.</p>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="cadence"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Billing cadence</FormLabel>
									<FormControl>
										<Select value={field.value} onValueChange={field.onChange} disabled={!isContracted}>
											<SelectTrigger className="w-full" aria-label="Billing cadence">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="anniversary">
													Anniversary — the day the grant started, every period
												</SelectItem>
												<SelectItem value="calendar">Calendar — the 1st of the month</SelectItem>
											</SelectContent>
										</Select>
									</FormControl>
									<p className="text-xs font-light text-muted-foreground">
										{isContracted
											? 'A change takes effect at the next renewal; the current period runs to its boundary.'
											: `Only a contracted grant can bill on the calendar; a ${
												grant?.source ?? ''
											} grant renews on its anniversary.`}
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>

						{isComped
							? (
								<GrantShapeFields
									enabled={open}
									disabled={boundComp}
									disabledNote={boundComp
										? `This comp is bound to ${grant?.clusterId}, and its shape is that cluster. Replace it with a new comp to change it.`
										: undefined}
								/>
							)
							: <GrantScopeFields enabled={open} existing={grant} />}

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

						{switchable && (onReplaceWithComp || canSwitchToPaid) && (
							<div className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
								<p className="text-sm font-medium">Change terms without stopping the cluster</p>
								<p className="text-xs text-muted-foreground">
									A replacement takes over from this grant in one step. Revoking instead ends it and stops the cluster
									at the next expiry pass.
								</p>
								<div className="flex flex-wrap gap-2">
									{onReplaceWithComp && (
										<Button type="button" variant="outline" disabled={isPending} onClick={onReplace}>
											Replace with comp
										</Button>
									)}
									{canSwitchToPaid && (
										<Button
											type="button"
											variant="outline"
											disabled={isPending}
											onClick={() => void onSwitchToPaid()}
										>
											Switch to paid
										</Button>
									)}
								</div>
							</div>
						)}

						<DialogFooter className="gap-2 sm:justify-between">
							{
								/* Revoke is not a value you set — it ends the grant, is exempt from the guards
							    protecting the other fields, and cannot be undone, so it is its own action. */
							}
							<Button type="button" variant="destructive" disabled={isPending} onClick={onRevoke}>
								{bound ? 'Revoke and stop cluster' : 'Revoke grant'}
							</Button>
							<div className="flex gap-2">
								<Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
								<Button
									type="submit"
									variant="submit"
									disabled={isPending || !form.formState.isValid || narrowsBoundScope}
								>
									Save changes
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>

				{/* Held open while the charge is in flight, so it cannot be dismissed with the request still running. */}
				<AlertDialog
					open={confirmingPaid}
					onOpenChange={(next) => !next && !inFlight.current && setConfirmingPaid(false)}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Switch {grant?.clusterId} to paid?</AlertDialogTitle>
							<AlertDialogDescription>
								The organization's card on file is charged now for the cluster's current plan, and its billing period
								starts today. The {grant?.source} grant {grant?.id} is retired, and the cluster keeps running.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={switching}>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={switching}
								onClick={(event) => {
									event.preventDefault();
									confirmSwitchToPaid();
								}}
							>
								{switching ? 'Switching…' : 'Switch to paid'}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</DialogContent>
		</Dialog>
	);
}
