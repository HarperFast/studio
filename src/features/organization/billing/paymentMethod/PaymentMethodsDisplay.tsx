import { Button } from '@/components/ui/button';
import { AddNewPaymentMethod } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethod';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { formatMonthAndYear } from '@/lib/formatMonthAndYear';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

const route = getRouteApi('');

export function PaymentMethodsDisplay() {
	const { organizationId } = route.useParams();
	const { update } = useOrganizationPermissions(organizationId);
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const paymentMethod = billing?.paymentMethod;
	const [replacingPaymentMethod, setReplacingPaymentMethod] = useState(false);
	const onReplacePaymentMethodClicked = useCallback(
		() => setReplacingPaymentMethod(!replacingPaymentMethod),
		[replacingPaymentMethod],
	);

	if (!update) {
		return (
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				You don't have access to this page, sorry!
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

	return <AddNewPaymentMethod />;
}
