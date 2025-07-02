import queryLMS from '../queryLMS';

export default async ({ auth, payment_method_id, stripe_id, customer_id }) =>
	queryLMS({
		endpoint: 'removePaymentMethod',
		method: 'POST',
		payload: {
			payment_method_id,
			stripe_id,
			customer_id,
		},
		auth,
	});
