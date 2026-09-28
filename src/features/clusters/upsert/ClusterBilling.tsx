import { ContactUs } from '@/components/ContactUs';
import { Button } from '@/components/ui/button';
import { renewalTerms } from '@/features/clusters/upsert/lib/renewalTerms';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { isUnrestrictedOrgType } from '@/integrations/api/orgType';
import { PaymentMethodStatus } from '@/integrations/stripe/paymentMethodStatus';
import { isPositive } from '@/lib/types/isPositive';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';

interface ClusterBillingProps {
	readonly clusterId?: string;
	readonly isPending: boolean;
	readonly onGoBackToDetails: () => void;
	readonly onSaveStateForBillingRedirect: (redirecting: boolean) => void;
	readonly onSubmit?: () => void;
	readonly organizationId: string;
	readonly selectedPlan: SchemaPlan | undefined;
}

export function ClusterBilling({
	clusterId,
	isPending,
	onGoBackToDetails,
	onSaveStateForBillingRedirect,
	onSubmit,
	organizationId,
	selectedPlan,
}: ClusterBillingProps) {
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const allowBypass = import.meta.env.DEV && !import.meta.env.VITE_PUBLIC_STRIPE_KEY;
	const isEnterprise = isUnrestrictedOrgType(organization?.type);
	const hasValidPaymentMethod = allowBypass || isEnterprise
		|| billing?.paymentMethod?.status === PaymentMethodStatus.PASS;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);
	const expirationMonths = isPositive(selectedPlan?.planLimits?.expirationMonths)
		&& selectedPlan.planLimits.expirationMonths < 1000 && selectedPlan.planLimits.expirationMonths;

	const footer = (
		<>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-3 max-w-xl">
				<Button
					type="button"
					variant="defaultOutline"
					disabled={isPending}
					onClick={onGoBackToDetails}
				>
					<ArrowLeftIcon /> Back to Details
				</Button>
				<Button
					disabled={isPending || !hasValidPaymentMethod || replacingPaymentMethod}
					type="submit"
					variant="submit"
					onClick={onSubmit}
				>
					{clusterId ? 'Edit Cluster' : 'Create New Cluster'} <ArrowRightIcon />
				</Button>
			</div>
		</>
	);

	if (isEnterprise) {
		return (
			<>
				<ul className="list-disc ml-6 max-w-lg">
					<li>
						Reminder: you will be billed at your contracted rate for any additional infrastructure.
					</li>
					<li>
						Your account representative can work with you to sort out more precise details, and to help accomplish your
						objectives with this cluster. <ContactUs overEmail={true} />, we are here to help.
					</li>
				</ul>

				{footer}
			</>
		);
	}

	if (allowBypass) {
		return (
			<>
				<ul className="list-disc ml-6">
					<li>
						Stripe is not configured, and will be bypassed during cluster creation.
					</li>
				</ul>

				{footer}
			</>
		);
	}

	return (
		<>
			<ul className="list-disc ml-6 mb-6">
				<li>You'll be charged today, and your cluster will be licensed for the usage you've selected immediately.</li>
				<li>{renewalTerms(expirationMonths)}</li>
				<li>
					If you use it all before then, your cluster keeps running. The extra usage is added to your next bill at the
					same rate, and you're only charged for what you use.
				</li>
				{clusterId && (
					<li>
						Scaling up or changing plans charges for the new usage today, and starts a new billing period from today.
					</li>
				)}
				<li>
					Payments are non-refundable. <ContactUs overEmail={true} /> if you need help planning your usage.
				</li>
			</ul>

			<p className="text-muted-foreground text-sm mb-6">Payment method:</p>

			<PaymentMethodsDisplay
				onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
				onReplacingPaymentMethod={setReplacingPaymentMethod}
			/>

			{footer}
		</>
	);
}
