import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import {
	getPromoRedemptionsQueryOptions,
	redeemPromoCode,
	useRedeemPromoCode,
} from '@/features/organization/billing/promoCodes/promoCodeApi';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

type Outcome = { tone: 'error' | 'success'; message: ReactNode };

/**
 * Sits inside the cluster `<form>`, so it has no `<form>` of its own and Enter must not submit the
 * cluster. `onBusyChange` holds the cluster submit until a redeemed voucher is selected.
 */
export function ClusterPromoCode({
	className,
	form,
	organizationId,
	onBusyChange,
}: {
	className: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	organizationId: string;
	onBusyChange?: (busy: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState('');
	const [outcome, setOutcome] = useState<Outcome | null>(null);
	const [busy, setBusyState] = useState(false);
	// A second Apply before the first re-render would replace the first call's callbacks.
	const busyRef = useRef(false);
	const queryClient = useQueryClient();
	const router = useRouter();
	const { mutate } = useRedeemPromoCode();
	const inputId = useId();
	const promoCodesPage = <Link to={`/${organizationId}/billing/promo-codes`} className="underline">Promo Codes</Link>;

	const setBusy = (value: boolean) => {
		busyRef.current = value;
		setBusyState(value);
		onBusyChange?.(value);
	};
	useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

	// The route context holds the organization the form reads its grants from, so the cache alone is not enough.
	const refreshOrganization = async () => {
		void queryClient.invalidateQueries({ queryKey: getPromoRedemptionsQueryOptions(organizationId).queryKey });
		const organization = await queryClient.fetchQuery({ ...getOrganizationQueryOptions(organizationId), staleTime: 0 });
		await router.invalidate();
		return organization;
	};

	const settleVoucher = async (grantId: string | undefined) => {
		let organization;
		try {
			organization = await refreshOrganization();
		} catch {
			setOutcome({ tone: 'success', message: 'Free cluster added. Reload the page to choose it.' });
			return;
		}
		if (!grantId || !organization.unboundGrants?.some((grant) => grant.id === grantId)) {
			setOutcome({
				tone: 'success',
				message: 'Free cluster added. Reload the page if it isn’t under Available grants.',
			});
			return;
		}
		form.setValue('grantId', grantId, { shouldDirty: true });
		void form.trigger();
		setOutcome({ tone: 'success', message: 'Free cluster added and selected under Available grants.' });
	};

	// The org's redemption of this code names the voucher's grant, if the lost request did land it.
	const recoverUnconfirmed = async (code: string) => {
		setOutcome({
			tone: 'error',
			message: <>We couldn&rsquo;t confirm the redemption. Check {promoCodesPage} before trying again.</>,
		});
		// Both settle before submit reopens; Promise.all would release it on the first failure.
		const [reloaded, history] = await Promise.allSettled([
			refreshOrganization(),
			queryClient.fetchQuery({ ...getPromoRedemptionsQueryOptions(organizationId), staleTime: 0 }),
		]);
		if (reloaded.status === 'rejected' || history.status === 'rejected') { return; }
		const organization = reloaded.value;
		const redemptions = history.value;
		const grantId = redemptions.find((redemption) =>
			redemption.code === code && redemption.kind === 'voucher' && redemption.status === 'APPLIED'
		)?.grantId;
		if (!grantId || !organization.unboundGrants?.some((grant) => grant.id === grantId)) { return; }
		form.setValue('grantId', grantId, { shouldDirty: true });
		void form.trigger();
		setOutcome({
			tone: 'success',
			message: 'Your free cluster arrived after a delay and is selected under Available grants.',
		});
	};

	const apply = () => {
		if (busyRef.current) { return; }
		const normalized = code.trim().toUpperCase();
		if (!normalized) {
			setOutcome({ tone: 'error', message: 'Enter a code' });
			return;
		}
		setOutcome(null);
		setBusy(true);
		mutate({ organizationId, code: normalized }, {
			onSuccess: async (result) => {
				try {
					await onRedeemed(result);
				} finally {
					setBusy(false);
				}
			},
			// A timeout or 5xx may still have redeemed the code, so submit stays held until the reload settles.
			onError: () => {
				void recoverUnconfirmed(normalized).finally(() => setBusy(false));
			},
		});
	};

	const onRedeemed = async (result: Awaited<ReturnType<typeof redeemPromoCode>>) => {
		if (!result.ok) {
			setOutcome({
				tone: 'error',
				message: result.status === 402
					? (
						<>
							A credit code needs a payment method. Create the cluster first, then redeem the code under Billing
							{' → '}
							{promoCodesPage}.
						</>
					)
					: result.message,
			});
			return;
		}
		setCode('');
		if (result.kind === 'credit') {
			void refreshOrganization().catch(() => {});
			setOutcome({
				tone: 'success',
				message: <>Credit added. It comes off your next invoices automatically; see {promoCodesPage}.</>,
			});
			return;
		}
		await settleVoucher(result.grantId);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== 'Enter') { return; }
		event.preventDefault();
		apply();
	};

	if (!open) {
		return (
			<div className={className}>
				<Button type="button" variant="link" className="h-auto p-0 text-foreground" onClick={() => setOpen(true)}>
					Have a promo code?
				</Button>
			</div>
		);
	}

	return (
		<div className={className}>
			<label htmlFor={inputId} className="pb-1 text-sm font-medium">Promo code</label>
			<div className="flex items-start gap-3">
				<Input
					id={inputId}
					value={code}
					onChange={(event) => setCode(event.target.value)}
					onKeyDown={onKeyDown}
					autoComplete="off"
					disabled={busy}
					maxLength={64}
					aria-invalid={outcome?.tone === 'error'}
					aria-describedby={outcome ? `${inputId}-outcome` : undefined}
				/>
				<Button type="button" variant="outline" disabled={busy} onClick={apply}>
					{busy ? 'Applying…' : 'Apply'}
				</Button>
			</div>
			{outcome && (
				<p
					id={`${inputId}-outcome`}
					role={outcome.tone === 'error' ? 'alert' : 'status'}
					className={`pt-1 text-xs ${outcome.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
				>
					{outcome.message}
				</p>
			)}
		</div>
	);
}
