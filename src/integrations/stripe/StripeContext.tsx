import { Loading } from '@/components/Loading';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { stripePromise } from '@/integrations/stripe/stripePromise';
import { useGetStripeClientSecret } from '@/integrations/stripe/useGetStripeClientSecret';
import { StripeContext } from '@/integrations/stripe/useStripeOptions';
import { Elements } from '@stripe/react-stripe-js';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ReactNode, useMemo } from 'react';

export function StripeWrapper({ children }: { children: ReactNode }) {
	const { organizationId } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const clientSecret = useGetStripeClientSecret({
		organizationId,
		enabled: !!organization,
		existingStripeId: organization?.stripeId,
	});
	const options = useMemo(() => {
		return {
			clientSecret: clientSecret || '',
			appearance: {
				theme: 'night' as const,
			},
		};
	}, [clientSecret]);

	if (!import.meta.env.VITE_PUBLIC_STRIPE_KEY) {
		console.error('No VITE_PUBLIC_STRIPE_KEY is configured for this environment.');
		return (
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				Setting up your billing is currently disabled. Please check back again later.
			</div>
		);
	}

	if (!clientSecret || !organization) {
		return <Loading centered />;
	}

	return (
		<StripeContext value={options}>
			<Elements stripe={stripePromise()} options={options}>
				{children}
			</Elements>
		</StripeContext>
	);
}
