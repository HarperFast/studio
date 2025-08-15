import { Loading } from '@/components/Loading';
import {
	useAttachPaymentMethodToOrganization,
} from '@/features/organization/mutations/payments/attachPaymentMethodToOrganization';
import { useStripe } from '@stripe/react-stripe-js';
import { useParams } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export function ProcessSetupIntent() {
	const { organizationId } = useParams({ strict: false });
	const urlParams = new URLSearchParams(window.location.search);
	const clientSecret = urlParams.get('setup_intent_client_secret');

	const stripe = useStripe();
	const { mutate: attachPaymentMethodToOrganization } = useAttachPaymentMethodToOrganization();
	const navigateBack = useCallback(() => {
		const prefix = '#/';
		const withoutStripesParams = location.href.split(prefix).pop() as string;
		const withoutConfirm = withoutStripesParams.split('/').slice(0, -1).join('/');
		// TODO: Toasts aren't showing up because of the location replace...
		location.replace('/' + prefix + withoutConfirm, );
	}, []);

	useEffect(() => {
		if (!stripe || !clientSecret || !attachPaymentMethodToOrganization || !organizationId || !navigateBack) {
			return;
		}

		stripe.retrieveSetupIntent(clientSecret).then(({ setupIntent }) => {
			switch (setupIntent?.status) {

				case 'succeeded':
					if (setupIntent.payment_method !== null) {
						attachPaymentMethodToOrganization({
							paymentMethodId: typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id,
							organizationId,
						}, {
							onSuccess: () => {
								toast.success('Success! Your payment method has been saved.');
								navigateBack();
							},
							onError: () => {
								navigateBack();
							},
						});
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

	}, [stripe, clientSecret, attachPaymentMethodToOrganization, organizationId, navigateBack]);

	return <Loading centered />;
}
