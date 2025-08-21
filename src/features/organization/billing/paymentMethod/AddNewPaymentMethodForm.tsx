import { Button } from '@/components/ui/button';
import { useProcessStripePaymentMethod } from '@/integrations/stripe/useProcessStripePaymentMethod';

import { useStripeOptions } from '@/integrations/stripe/useStripeOptions';
import { AddressElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useParams } from '@tanstack/react-router';
import { Save } from 'lucide-react';
import { FormEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

interface AddNewPaymentMethodFormProps {
	readonly hasExistingBilling: boolean;
	readonly onPaymentAdded: (added: boolean) => void;
	readonly onSaveStateForBillingRedirect: (redirecting: boolean) => void;
}

export function AddNewPaymentMethodForm({
	hasExistingBilling,
	onPaymentAdded,
	onSaveStateForBillingRedirect,
}: AddNewPaymentMethodFormProps) {
	const { organizationId } = useParams({ strict: false });
	const stripe = useStripe();
	const stripeOptions = useStripeOptions();
	const elements = useElements();
	const [loading, setLoading] = useState(false);
	const processStripePaymentMethod = useProcessStripePaymentMethod(organizationId);

	const onCancelClicked = useCallback(() => {
		onPaymentAdded(false);
	}, [onPaymentAdded]);

	const onSubmitAddPaymentMethod = useCallback(async (evt: FormEvent) => {
		evt.preventDefault();
		if (!stripe || !elements) {
			return;
		}
		setLoading(true);

		await elements.submit();
		onSaveStateForBillingRedirect?.(true);
		const result = await stripe.confirmSetup({
			clientSecret: stripeOptions.clientSecret!,
			elements,
			redirect: 'if_required',
			confirmParams: {
				return_url: `${window.location.origin}/orgs/${organizationId}/billing/confirm`,
			},
		});

		if (result.error) {
			console.error(result.error.message);
			toast.error(result.error.message);
			setLoading(false);
			onSaveStateForBillingRedirect?.(false);
		} else if (result.setupIntent.payment_method) {
			processStripePaymentMethod(result.setupIntent.payment_method, onPaymentAdded);
			onSaveStateForBillingRedirect?.(false);
		} else {
			// For some payment methods, they will be redirected to an intermediate site first to authorize the
			// payment, then redirected to the `return_url`.
		}
	}, [elements, onPaymentAdded, onSaveStateForBillingRedirect, organizationId, processStripePaymentMethod, stripe, stripeOptions.clientSecret]);

	return (
		<form onSubmit={onSubmitAddPaymentMethod} className="max-w-xl">
			<PaymentElement />
			<AddressElement options={{ mode: 'billing' }} />

			<div className="mt-4 flex gap-8 items-center">
				<Button disabled={!stripe || !elements || loading} variant="submit" className="rounded-full">
					<Save /> Add Payment Method
				</Button>
				{hasExistingBilling && (<>
					<div className="text-xs text-gray-600">Your existing payment method will be overwritten.</div>
					<Button variant="defaultOutline" type="button" onClick={onCancelClicked}>Cancel</Button>
				</>)}
			</div>
		</form>
	);
}
