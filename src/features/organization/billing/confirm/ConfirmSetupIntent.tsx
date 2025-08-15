import {
	useAttachPaymentMethodToOrganization,
} from '@/features/organization/mutations/payments/attachPaymentMethodToOrganization';
import { useStripe } from '@stripe/react-stripe-js';
import { useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';

export function ConfirmSetupIntent() {
	const stripe = useStripe();
	const search = useSearch({ strict: false });

	const { mutate: attachPaymentMethodToOrganization } = useAttachPaymentMethodToOrganization();
	const clientSecret = search.setup_intent_client_secret;

	useEffect(() => {
		if (!stripe || !clientSecret) {
			return;
		}

		stripe.retrieveSetupIntent(clientSecret).then(({ setupIntent }) => {
			// [0]: https://stripe.com/docs/payments/payment-methods#payment-notification
			switch (setupIntent?.status) {
				case 'succeeded': {
					// message.innerText = 'Success! Your payment method has been saved.';
					break;
				}

				case 'processing': {
					// message.innerText = 'Processing payment details. We\'ll update you when processing is complete.';
					break;
				}

				case 'requires_payment_method': {
					// message.innerText = 'Failed to process payment details. Please try another payment method.';

					// Redirect your user back to your payment page to attempt collecting
					// payment again

					break;
				}
			}
		});

	}, [stripe, clientSecret]);

	return <div>well</div>;
}
