import { Loading } from '@/components/Loading';
import { AddNewPaymentMethodForm } from '@/features/organization/billing/paymentMethod/AddNewPaymentMethodForm';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { stripePromise } from '@/integrations/stripe/stripePromise';
import { useGetStripeClientSecret } from '@/integrations/stripe/useGetStripeClientSecret';
import { Elements } from '@stripe/react-stripe-js';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('');

export function AddNewPaymentMethod() {
	const { organizationId } = route.useParams();
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const paymentMethod = billing?.paymentMethod;
	const clientSecret = useGetStripeClientSecret({
		organizationId,
		enabled: !!organization,
		existingStripeId: organization?.stripeId,
	});

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
		<Elements stripe={stripePromise()} options={{
			clientSecret,
			appearance: {
				theme: 'night',
			},
		}}>
			<div className="mt-2 mb-6">
				{!paymentMethod && 'You currently have no payment method on file. Please fill out the secure form below.'}
			</div>
			<AddNewPaymentMethodForm clientSecret={clientSecret} hasExistingBilling={!!billing} />
		</Elements>
	);
}
