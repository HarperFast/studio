import { ContactUs } from '@/components/ContactUs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddNewPaymentMethod } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethod';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { isUnrestrictedOrgType } from '@/integrations/api/orgType';
import {
	translateStripePaymentMethodStatusToText,
	translateStripePaymentMethodStatusToVariant,
} from '@/integrations/stripe/translateStripePaymentMethodStatus';
import { formatMonthAndYear } from '@/lib/formatMonthAndYear';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

interface PaymentMethodsDisplayProps {
	onSaveStateForBillingRedirect?: (redirecting: boolean) => void;
	onReplacingPaymentMethod?: (value: boolean) => void;
}

export function PaymentMethodsDisplay(props?: PaymentMethodsDisplayProps) {
	const { onSaveStateForBillingRedirect, onReplacingPaymentMethod } = props ?? {};
	const { organizationId } = useParams({ strict: false });
	const { update } = useOrganizationPermissions(organizationId);
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

	// A contract bills an unrestricted organization's clusters, but one moved onto paid terms is charged to
	// the card, and the card has to be on file before staff can move it.
	const contracted = isUnrestrictedOrgType(organization?.type);
	if (contracted && !paymentMethod && !update) {
		return (
			<span>
				You are part of an enterprise organization! We don&rsquo;t currently show your payment methods on this page.
				Want to explore your solution with Harper more? <ContactUs />, we would love to talk!
			</span>
		);
	}

	const contractNote = contracted && (
		<p className="mt-2 text-sm text-muted-foreground">
			Your clusters are billed by your contract. A card here is charged only for a cluster your account team moves onto
			paid terms.
		</p>
	);

	if (paymentMethod && !replacingPaymentMethod) {
		return (
			<>
				{contractNote}
				<div className="mt-2">
					{paymentMethod.brand?.toUpperCase() ?? 'Card'} ending in {paymentMethod.last4 ?? '••••'}
					{(paymentMethod.expMonth && paymentMethod.expYear)
						? <>(exp {formatMonthAndYear(paymentMethod.expMonth, paymentMethod.expYear)})</>
						: null}
					{paymentMethod.status
						? (
							<>
								—{' '}
								<Badge variant={translateStripePaymentMethodStatusToVariant(paymentMethod.status)}>
									{translateStripePaymentMethodStatusToText(paymentMethod.status)}
								</Badge>
							</>
						)
						: null}
				</div>
				{update && (
					<div className="mt-2 mb-6">
						<Button variant="defaultOutline" type="button" onClick={onReplacePaymentMethodClicked}>
							Replace Payment Method
						</Button>
					</div>
				)}
			</>
		);
	}

	if (!update) {
		return (
			<div>
				This org doesn't have a payment method, and you don't have access to add one. Please contact your administrator.
			</div>
		);
	}

	return (
		<>
			{contractNote}
			<AddNewPaymentMethod
				onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
				onPaymentAdded={onPaymentAdded}
			/>
		</>
	);
}
