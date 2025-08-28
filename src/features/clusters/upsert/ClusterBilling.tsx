import { Button } from '@/components/ui/button';
import { ResourcesPerInstance } from '@/features/clusters/upsert/components/ResourcesPerInstance';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { PaymentMethodStatus } from '@/integrations/stripe/paymentMethodStatus';
import { SchemaPlan } from '@/lib/api.gen';
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
	readonly selectedAutoRenew: boolean;
	readonly selectedPlan: SchemaPlan | undefined;
}

export function ClusterBilling({
	clusterId,
	isPending,
	onGoBackToDetails,
	onSaveStateForBillingRedirect,
	onSubmit,
	organizationId,
	selectedAutoRenew,
	selectedPlan,
}: ClusterBillingProps) {
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const allowBypass = import.meta.env.DEV && !import.meta.env.VITE_PUBLIC_STRIPE_KEY;
	const isEnterprise = organization?.type === 'ENTERPRISE';
	const hasValidPaymentMethod = allowBypass || isEnterprise || billing?.paymentMethod?.status === PaymentMethodStatus.PASS;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);

	const footer = (<>
		<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-3 max-w-xl">
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
				{clusterId ? 'Edit Cluster' : 'Create New Cluster'} <ArrowRightIcon />
			</Button>
		</div>
	</>);

	if (isEnterprise) {
		return (<>
			<ul className="list-disc ml-6">
				<li>Your organization&rsquo;s enterprise agreement with Harper can adjust the retail price you see on
					this page.
				</li>
				<li>Your account representative can work with you to sort out more precise details, and to help
					accomplish your objectives with this
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
		<ul className="list-disc ml-6 mb-6">
			<li>You will be billed for this cluster today, and will receive a license for the block of usage you've
				requested.
			</li>
			{clusterId && (
				<li>If you scale up, you'll be charged for the additional blocks you've purchased
					now{selectedAutoRenew ? ', and your next auto renewal will be for all purchased blocks' : ''}.
				</li>)}
			{clusterId && (<li>If you remove a region, that usage block will not be used (because it is specific to that
				region).</li>)}
			<li>{selectedAutoRenew
				? 'When that block is used up, or 3 months elapse, you will be automatically renewed.'
				: 'When that block is used up, or 3 months elapse, you will NOT be automatically renewed.'}
			</li>
			<li>While refunds are not available, we’d be happy to assist you with... swag, depending on availability.
			</li>
			<li>We would love to work with you to sort out more precise details, and to help accomplish your objectives
				with this
				cluster. <a href="https://www.harpersystems.dev/contact" target="_blank" className="underline">Contact
					us</a>, we are here to help.
			</li>
		</ul>

		{selectedPlan?.planLimits && selectedPlan.resourcesPerInstance && (
			<ResourcesPerInstance planLimits={selectedPlan.planLimits} resourcesPerInstance={selectedPlan.resourcesPerInstance} />
		)}

		<p className="text-muted-foreground text-sm mb-6">Payment method:</p>

		<PaymentMethodsDisplay onSaveStateForBillingRedirect={onSaveStateForBillingRedirect} onReplacingPaymentMethod={setReplacingPaymentMethod} />

		{footer}
	</>);
}
