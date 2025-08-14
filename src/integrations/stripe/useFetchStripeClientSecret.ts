import { getOrganization } from '@/features/organization/queries/getOrganizationQuery';
import { addStripeToOrganizationAndGetIntent } from '@/integrations/stripe/addStripeToOrganizationAndGetIntent';
import { getNewStripeIntentForOrganization } from '@/integrations/stripe/getNewStripeIntentForOrganization';
import { useMemo } from 'react';

export function useFetchStripeClientSecret(organizationId: string): () => Promise<string> {
	return useMemo(() => {
		return async () => {
			if (!import.meta.env.VITE_PUBLIC_STRIPE_KEY) {
				return '';
			}
			const org = await getOrganization(organizationId);
			const stripeAccount = org.stripeId
				? await getNewStripeIntentForOrganization({ organizationId })
				: await addStripeToOrganizationAndGetIntent({ organizationId });

			return stripeAccount.clientSecret;
		};
	}, [organizationId]);
}

