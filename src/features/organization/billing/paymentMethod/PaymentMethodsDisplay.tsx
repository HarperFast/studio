import { Button } from '@/components/ui/button';
import { AddNewPaymentMethod } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethod';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { formatMonthAndYear } from '@/lib/formatMonthAndYear';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

const route = getRouteApi('');

interface PaymentMethodsDisplayProps {
	onSaveStateForBillingRedirect: (redirecting: boolean) => void;
}

export function PaymentMethodsDisplay({ onSaveStateForBillingRedirect }: PaymentMethodsDisplayProps) {
	const { organizationId } = route.useParams();
	const { update } = useOrganizationPermissions(organizationId);
	const { data: organization, refetch } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const paymentMethod = billing?.paymentMethod;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);
	const onReplacePaymentMethodClicked = useCallback(
		() => setReplacingPaymentMethod(!replacingPaymentMethod),
		[replacingPaymentMethod],
	);
	const onPaymentAdded = useCallback((added: boolean) => {
		setReplacingPaymentMethod(false);
		if (added) {
			void refetch();
		}
	}, [refetch]);

	if (!update) {
		return (
			<div>
				You don't have access to add payment methods to this organization. Please contact your administrator.
			</div>
		);
	}

	if (paymentMethod && !replacingPaymentMethod) {
		return (<>
			<div className="mt-2">
				{paymentMethod.brand?.toUpperCase() ?? 'Card'} ending in {paymentMethod.last4 ?? '••••'}
				{(paymentMethod.expMonth && paymentMethod.expYear) ? (
					<> (exp {formatMonthAndYear(paymentMethod.expMonth, paymentMethod.expYear)})</>
				) : null}
				{paymentMethod.status ? <> — {paymentMethod.status?.toUpperCase()}</> : null}
			</div>
			<div className="mt-2 mb-6">
				<Button variant="defaultOutline" type="button" onClick={onReplacePaymentMethodClicked}>
					Replace Payment Method</Button>
			</div>
		</>);
	}

	return <AddNewPaymentMethod
		onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
		onPaymentAdded={onPaymentAdded}
	/>;
}
