import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddNewPaymentMethod } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethod';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import {
	translateStripePaymentMethodStatusToText,
	translateStripePaymentMethodStatusToVariant,
} from '@/integrations/stripe/translateStripePaymentMethodStatus';
import { formatMonthAndYear } from '@/lib/formatMonthAndYear';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

const route = getRouteApi('');

interface PaymentMethodsDisplayProps {
	onSaveStateForBillingRedirect: (redirecting: boolean) => void;
	onReplacingPaymentMethod: (value: boolean) => void;
}

export function PaymentMethodsDisplay({
	onSaveStateForBillingRedirect,
	onReplacingPaymentMethod,
}: PaymentMethodsDisplayProps) {
	const { organizationId } = route.useParams();
	const { data: organization, refetch } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const paymentMethod = billing?.paymentMethod;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);
	const onReplacePaymentMethodClicked = useCallback(
		() => {
			setReplacingPaymentMethod(!replacingPaymentMethod);
			onReplacingPaymentMethod?.(!replacingPaymentMethod);
		},
		[onReplacingPaymentMethod, replacingPaymentMethod],
	);
	const onPaymentAdded = useCallback((added: boolean) => {
		setReplacingPaymentMethod(false);
		onReplacingPaymentMethod?.(false);
		if (added) {
			void refetch();
		}
	}, [onReplacingPaymentMethod, refetch]);

	if (organization?.type === 'ENTERPRISE') {
		return (
			<span>
				You are part of an enterprise organization! We don&rsquo;t currently show your payment methods on this
				page. Want to explore your solution with Harper
				more? <a href="https://www.harpersystems.dev/contact" target="_blank" className="underline">Contact
				us</a>, we would love to talk!
			</span>
		);
	}

	if (paymentMethod && !replacingPaymentMethod) {
		return (<>
			<div className="mt-2">
				{paymentMethod.brand?.toUpperCase() ?? 'Card'} ending in {paymentMethod.last4 ?? '••••'}
				{(paymentMethod.expMonth && paymentMethod.expYear) ? (
					<> (exp {formatMonthAndYear(paymentMethod.expMonth, paymentMethod.expYear)})</>
				) : null}
				{paymentMethod.status ? <> — <Badge variant={translateStripePaymentMethodStatusToVariant(paymentMethod.status)}>{translateStripePaymentMethodStatusToText(paymentMethod.status)}</Badge></> : null}
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
