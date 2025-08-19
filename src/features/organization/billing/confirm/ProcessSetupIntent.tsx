import { Loading } from '@/components/Loading';
import { useProcessStripePaymentMethod } from '@/integrations/stripe/useProcessStripePaymentMethod';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export function ProcessSetupIntent() {
	const { organizationId } = useParams({ strict: false });
	const navigate = useNavigate();
	const { setup_intent_client_secret: clientSecret } = useSearch({ strict: false });

	const stripe = useStripe();
	const processStripePaymentMethod = useProcessStripePaymentMethod(organizationId);
	const navigateBack = useCallback(() => {
		void navigate({ search: undefined, to: '../' });
	}, [navigate]);

	useEffect(() => {
		if (!stripe || !clientSecret || !processStripePaymentMethod || !organizationId || !navigateBack) {
			return;
		}

		stripe.retrieveSetupIntent(clientSecret).then(({ setupIntent }) => {
			switch (setupIntent?.status) {

				case 'succeeded':
					if (setupIntent.payment_method !== null) {
						processStripePaymentMethod(setupIntent.payment_method, navigateBack);
					} else {
						toast.error('Failed to process payment method details. Please try another payment method.');
						navigateBack();
					}
					break;

				case 'processing':
					toast.warning('Processing payment method. Please check back later.');
					navigateBack();
					break;

				case 'requires_payment_method':
					toast.error('Failed to process payment method details. Please try another payment method.');
					navigateBack();
					break;

				default:
					toast.error('Failed to process payment method details. Please try another payment method.');
					navigateBack();
					break;

			}
		});

	}, [clientSecret, navigateBack, organizationId, processStripePaymentMethod, stripe]);

	return <Loading centered />;
}
