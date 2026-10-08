import { ContactUs } from '@/components/ContactUs';
import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useIsOrganizationAdmin } from '@/hooks/usePermissions';
import { PromoRedemptionView } from '@/integrations/api/api.patch';
import { isUnrestrictedOrgType } from '@/integrations/api/orgType';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { formatCents, formatDay, getPromoRedemptionsQueryOptions, useRedeemPromoCode } from './promoCodeApi';

const RedeemSchema = z.object({
	code: z.string().trim().min(1, 'Enter a code').max(64, 'That code is too long'),
});
type RedeemValues = z.infer<typeof RedeemSchema>;

function describeValue(redemption: PromoRedemptionView) {
	if (redemption.kind === 'credit') {
		return `${formatCents(redemption.creditCents ?? 0)} credit`;
	}
	const rows = redemption.shape ?? [];
	return `Free cluster: ${
		rows.map((row) => (row.regionId ? `${row.planId} in ${row.regionId}` : row.planId)).join(', ') || 'see Clusters'
	}`;
}

// An unclaimed voucher past its end can no longer be claimed; central manager leaves its row APPLIED.
const voucherLapsed = (redemption: PromoRedemptionView) =>
	redemption.kind === 'voucher' && !redemption.voucherClaimed && !!redemption.voucherEndsAt
	&& new Date(redemption.voucherEndsAt).getTime() <= Date.now();

const voucherReady = (redemption: PromoRedemptionView) =>
	redemption.kind === 'voucher' && redemption.status === 'APPLIED' && !redemption.voucherClaimed
	&& !voucherLapsed(redemption);

function describeBalance(redemption: PromoRedemptionView) {
	if (redemption.status === 'CLAIMED') { return 'Being added…'; }
	if (redemption.status === 'FAILED') { return 'Didn’t go through — redeem the code again'; }
	if (redemption.status === 'EXPIRED' || voucherLapsed(redemption)) { return 'Expired'; }
	if (redemption.kind === 'credit') {
		if (redemption.remainingCents == null) { return '—'; }
		return `${formatCents(redemption.remainingCents)} left`;
	}
	return redemption.voucherClaimed ? 'In use' : 'Ready to use';
}

function useByDate(redemption: PromoRedemptionView) {
	const iso = redemption.kind === 'credit' ? redemption.creditExpiresAt : redemption.voucherEndsAt;
	return iso ? formatDay(iso) : '—';
}

export function PromoCodes() {
	const { organizationId } = useParams({ strict: false }) as { organizationId?: string };
	const queryClient = useQueryClient();
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const unrestricted = isUnrestrictedOrgType(organization?.type);
	const isAdmin = useIsOrganizationAdmin(organizationId ?? '');
	const { data: redemptions, isLoading, isError } = useQuery({
		...getPromoRedemptionsQueryOptions(organizationId),
		enabled: !!organizationId && !!organization && !unrestricted,
	});
	const { mutate, isPending } = useRedeemPromoCode();

	const form = useForm<RedeemValues>({ resolver: zodResolver(RedeemSchema), defaultValues: { code: '' } });

	const onSubmit = useCallback(
		(values: RedeemValues) => {
			if (!organizationId) { return; }
			mutate(
				{ organizationId, code: values.code.trim().toUpperCase() },
				{
					onSuccess: (result) => {
						if (!result.ok) {
							form.setError('code', { message: result.message });
							return;
						}
						form.reset({ code: '' });
						void queryClient.invalidateQueries({ queryKey: [organizationId] });
						toast.success('Code redeemed', {
							description: result.kind === 'credit'
								? 'The credit comes off your next invoices automatically.'
								: 'Your free cluster is ready. Choose it when you create a cluster.',
						});
					},
					// A timeout or 5xx may still have redeemed the code, so the list is refreshed either way.
					onError: () => {
						form.setError('code', {
							message: 'We couldn’t confirm the redemption. Check Your codes below before trying again.',
						});
						void queryClient.invalidateQueries({ queryKey: [organizationId] });
					},
				},
			);
		},
		[form, mutate, organizationId, queryClient],
	);

	if (unrestricted) {
		return (
			<span>
				Your organization is billed by contract, so promo codes don&rsquo;t apply. <ContactUs /> with any questions.
			</span>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-2 max-w-xl">
				<h2 className="text-lg">Redeem a code</h2>
				{isAdmin
					? (
						<Form {...form}>
							<form onSubmit={form.handleSubmit(onSubmit)} className="flex items-start gap-3">
								<FormField
									control={form.control}
									name="code"
									render={({ field }) => (
										<FormItem className="min-w-0 flex-1">
											<FormLabel className="sr-only">Promo code</FormLabel>
											<FormControl>
												<Input {...field} placeholder="e.g. WELCOME100" autoComplete="off" disabled={isPending} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<Button type="submit" disabled={isPending}>{isPending ? 'Redeeming…' : 'Redeem'}</Button>
							</form>
						</Form>
					)
					: (
						<p className="text-sm text-muted-foreground">
							Only an organization admin can redeem a code. Codes already redeemed are listed below.
						</p>
					)}
				<p className="text-xs text-muted-foreground">
					A credit code needs a payment method on file. Promo credit has no cash value, can&rsquo;t be refunded or
					transferred, and expires on its use-by date.
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg">Your codes</h2>
				{isLoading
					? <Loading />
					: isError
					? <p className="text-sm text-destructive">Your codes couldn&rsquo;t be loaded. Try again shortly.</p>
					: !redemptions?.length
					? <p className="text-sm text-muted-foreground">You haven&rsquo;t redeemed a code yet.</p>
					: (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Code</TableHead>
									<TableHead>Gives</TableHead>
									<TableHead>Balance</TableHead>
									<TableHead>Use by</TableHead>
									<TableHead>Redeemed</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{redemptions.map((redemption) => (
									<TableRow key={redemption.code}>
										<TableCell className="font-mono">{redemption.code}</TableCell>
										<TableCell>{describeValue(redemption)}</TableCell>
										<TableCell>
											{voucherReady(redemption)
												? (
													<Link to={`/${organizationId}/new-cluster`}>
														<Badge variant="outline">Ready to use</Badge>
													</Link>
												)
												: describeBalance(redemption)}
										</TableCell>
										<TableCell>{useByDate(redemption)}</TableCell>
										<TableCell>{formatDay(redemption.redeemedAt)}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				{redemptions?.some((redemption) => redemption.kind === 'credit' && redemption.status === 'APPLIED') && (
					<p className="text-xs text-muted-foreground">
						The balance shows credit not yet used by an invoice. Usage above your plan this month is charged at renewal,
						so it is taken from the credit then.
					</p>
				)}
			</section>
		</div>
	);
}
