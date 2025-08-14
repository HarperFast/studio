import { Loading } from '@/components/Loading';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { stripePromise } from '@/integrations/stripe/stripePromise';
import { useGetStripeClientSecret } from '@/integrations/stripe/useGetStripeClientSecret';
import { Elements, PaymentElement } from '@stripe/react-stripe-js';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('');

export function Billing() {
	const { organizationId } = route.useParams();
	const { update } = useOrganizationPermissions(organizationId);
	const { data } = useQuery(getOrganizationQueryOptions(organizationId));
	const clientSecret = useGetStripeClientSecret({
		organizationId,
		enabled: !!data,
		existingStripeId: data?.stripeId,
	});

	// const { mutate: attachPaymentMethodToOrganization } = useAttachPaymentMethodToOrganization();

	if (!update) {
		return (
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				You don't have access to this page, sorry!
			</div>
		);
	}
	if (!import.meta.env.VITE_PUBLIC_STRIPE_KEY) {
		console.error('No VITE_PUBLIC_STRIPE_KEY is configured for this environment.');
		return (
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				Setting up your billing is currently disabled. Please check back again later.
			</div>
		);
	}

	if (!clientSecret) {
		return <Loading />;
	}

	return (
		<Elements stripe={stripePromise()} options={{
			clientSecret,
			appearance: {
				theme: 'night',
			},
		}}>
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<PaymentElement />
			</div>
		</Elements>
	);
}
