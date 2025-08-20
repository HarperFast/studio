import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
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
	const hasValidPaymentMethod = billing?.paymentMethod?.status === 'pass';
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);

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
}
