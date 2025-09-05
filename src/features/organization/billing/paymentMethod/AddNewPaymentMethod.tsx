import { AddNewPaymentMethodForm } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethodForm';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { StripeWrapper } from '@/integrations/stripe/StripeContext';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

interface AddNewPaymentMethodProps {
	readonly onPaymentAdded: (added: boolean) => void;
	readonly onSaveStateForBillingRedirect?: (redirecting: boolean) => void;
}

export function AddNewPaymentMethod({ onPaymentAdded, onSaveStateForBillingRedirect }: AddNewPaymentMethodProps) {
	const { organizationId } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const paymentMethod = billing?.paymentMethod;

	return (
		<StripeWrapper>
			<div className="mt-2 mb-6">
				{!paymentMethod && 'You currently have no payment method on file. Please fill out the secure form below.'}
			</div>
			<AddNewPaymentMethodForm
				hasExistingBilling={!!billing}
				onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
				onPaymentAdded={onPaymentAdded}
			/>
		</StripeWrapper>
	);
}
