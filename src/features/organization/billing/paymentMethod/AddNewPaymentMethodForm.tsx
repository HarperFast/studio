import { Button } from '@/components/ui/button';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Save } from 'lucide-react';
import { FormEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

export function AddNewPaymentMethodForm({ clientSecret, hasExistingBilling }: {
	readonly clientSecret: string;
	readonly hasExistingBilling: boolean;
}) {

	const stripe = useStripe();
	const elements = useElements();
	const [loading, setLoading] = useState(false);

	const onSubmitAddPaymentMethod = useCallback(async (evt: FormEvent) => {
		evt.preventDefault();
		if (!stripe || !elements) {
			return;
		}
		setLoading(true);

		await elements.submit();
		const result = await stripe.confirmSetup({
			clientSecret,
			elements,
			confirmParams: {
				return_url: window.location.href + '/confirm',
			},
		});

		if (result.error) {
			console.error(result.error.message);
			toast.error(result.error.message);
			setLoading(false);
		} else {
			// They will be redirected to `return_url` by Stripe. For some payment methods, they will be redirected
			// to an intermediate site first to authorize the payment, then redirected to the `return_url`.
		}
	}, [clientSecret, elements, stripe]);

	return (
		<form onSubmit={onSubmitAddPaymentMethod} className="max-w-lg">
			<PaymentElement />

			<div className="mt-4 flex gap-8 items-center">
				<Button disabled={!stripe || !elements || loading} variant="submit" className="rounded-full">
					<Save /> Add Payment Method
				</Button>
				{hasExistingBilling && (<div className="text-xs text-gray-600">
					Your existing payment method will be overwritten.
				</div>)}
			</div>
		</form>
	);
}
