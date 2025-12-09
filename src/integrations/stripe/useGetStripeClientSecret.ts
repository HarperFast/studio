import { SchemaStripeAccount } from '@/integrations/api/api.gen';
import { useAddStripeToOrganizationAndGetIntent } from '@/integrations/stripe/addStripeToOrganizationAndGetIntent';
import { useGetNewStripeIntentForOrganization } from '@/integrations/stripe/getNewStripeIntentForOrganization';
import { useCallback, useEffect, useState } from 'react';

interface Params {
	enabled: boolean;
	organizationId: string;
	existingStripeId: string | undefined;
}

export function useGetStripeClientSecret(params: Params) {
	const { enabled, existingStripeId, organizationId } = params;
	const { mutate: addStripeToOrganizationAndGetIntent } = useAddStripeToOrganizationAndGetIntent();
	const { mutate: getNewStripeIntentForOrganization } = useGetNewStripeIntentForOrganization();
	const [clientSecret, setClientSecret] = useState<string | undefined>(undefined);

	const gotClientSecret = useCallback((data: SchemaStripeAccount) => {
		setClientSecret(data.clientSecret);
	}, []);

	useEffect(() => {
		if (enabled && import.meta.env.VITE_PUBLIC_STRIPE_KEY) {
			if (existingStripeId) {
				getNewStripeIntentForOrganization({ organizationId }, { onSuccess: gotClientSecret });
			} else {
				addStripeToOrganizationAndGetIntent({ organizationId }, { onSuccess: gotClientSecret });
			}
		}
	}, [
		addStripeToOrganizationAndGetIntent,
		enabled,
		existingStripeId,
		getNewStripeIntentForOrganization,
		gotClientSecret,
		organizationId,
	]);

	return clientSecret;
}
