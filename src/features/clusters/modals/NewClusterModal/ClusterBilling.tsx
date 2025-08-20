import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { PaymentMethodStatus } from '@/integrations/stripe/paymentMethodStatus';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';

interface ClusterBillingProps {
	readonly isPending: boolean;
	readonly onSaveStateForBillingRedirect: (redirecting: boolean) => void;
	readonly onSubmit?: () => void;
	readonly onGoBackToDetails: () => void;
}

export function ClusterBilling({
	isPending,
	onSaveStateForBillingRedirect,
	onSubmit,
	onGoBackToDetails,
}: ClusterBillingProps) {
	const { organizationId } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const allowBypass = import.meta.env.DEV && !import.meta.env.VITE_PUBLIC_STRIPE_KEY;
	const isEnterprise = organization?.type === 'ENTERPRISE';
	const hasValidPaymentMethod = allowBypass || isEnterprise || billing?.paymentMethod?.status === PaymentMethodStatus.PASS;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);

	const footer = (<>
		<DialogFooter className="mt-3">
			<Button type="button" variant="defaultOutline" className="rounded-full" disabled={isPending} onClick={onGoBackToDetails}>
				<ArrowLeftIcon /> Back to Details
			</Button>
			<Button
				disabled={isPending || !hasValidPaymentMethod || replacingPaymentMethod}
				type="submit"
				variant="submit"
				className="rounded-full"
				onClick={onSubmit}
			>
				Create New Cluster <ArrowRightIcon />
			</Button>
		</DialogFooter>
	</>);

	if (isEnterprise) {
		return (<>
			<ul className="list-disc ml-6">
				<li>Your organization&rsquo;s enterprise agreement with Harper will adjust the price you see on this
					page.
				</li>
				<li>Your account representative can work with you to sort out more precise details, and to help
					accomplish your objectives with this new
					cluster. <a href="https://www.harpersystems.dev/contact" target="_blank" className="underline">Contact
						us</a>, we are here to help.
				</li>
			</ul>

			{footer}
		</>);
	}

	if (allowBypass) {
		return (<>
			<ul className="list-disc ml-6">
				<li>Stripe is not configured, and will be bypassed during cluster creation.
				</li>
			</ul>

			{footer}
		</>);
	}

	return (<>
		<ul className="list-disc ml-6">
			<li>You will be billed for this cluster today, and will receive a license for the
				block of usage you've requested.
			</li>
			<li>When that block is used up, or 3 months elapse, you will be automatically
				renewed.
			</li>
		</ul>

		<DialogDescription>Payment method:</DialogDescription>

		<div className="overflow-auto max-h-[calc(100vh-theme(spacing.96))]">
			<PaymentMethodsDisplay onSaveStateForBillingRedirect={onSaveStateForBillingRedirect} onReplacingPaymentMethod={setReplacingPaymentMethod} />
		</div>

		{footer}
	</>);
}
