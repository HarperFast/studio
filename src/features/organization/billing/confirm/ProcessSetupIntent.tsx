import { Loading } from '@/components/Loading';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useProcessStripePaymentMethod } from '@/integrations/stripe/useProcessStripePaymentMethod';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { currentUrlIncludingHash } from '@/lib/urls/currentUrlIncludingHash';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

export function ProcessSetupIntent() {
	const { organizationId } = useParams({ strict: false });
	const navigate = useNavigate();
	const urlParams = new URLSearchParams(window.location.search);
	const clientSecretBeforeHash = urlParams.get('setup_intent_client_secret');
	const { setup_intent_client_secret: clientSecretAfterHash }: {
		setup_intent_client_secret?: string
	} = useSearch({ strict: false });
	const [savedClusterState] = useLocalStorage<{
		clusterId?: string
	} & unknown | null>(LocalStorageKeys.SavedClusterState, null);
	const clientSecret = clientSecretBeforeHash || clientSecretAfterHash;

	const stripe = useStripe();
	const processStripePaymentMethod = useProcessStripePaymentMethod(organizationId);
	const navigateBack = useCallback(() => {
		const to = savedClusterState
			? savedClusterState.clusterId
				? `../../${savedClusterState.clusterId}/edit`
				: '../../new-cluster'
			: '../';
		window.history.replaceState(null, '', currentUrlIncludingHash());
		void navigate({ search: undefined, to });
	}, [navigate, savedClusterState]);

	useEffect(() => {
		if (!stripe || !clientSecret || !processStripePaymentMethod || !organizationId || !navigateBack) {
			return;
		}

		(async function() {
			try {
				const { setupIntent } = await stripe.retrieveSetupIntent(clientSecret);
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
			} catch (err) {
				console.error(err);
				toast.error('Failed to process payment method details. Please try another payment method.');
				navigateBack();
			}
		})();
	}, [clientSecret, navigateBack, organizationId, processStripePaymentMethod, stripe]);

	return <Loading centered />;
}
