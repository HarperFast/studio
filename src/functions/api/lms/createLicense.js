import queryLMS from '../queryLMS';

export default async ({ auth, compute_stack_id, customer_id, fingerprint }) =>
	queryLMS({
		endpoint: 'createLicense',
		method: 'POST',
		payload: {
			compute_stack_id,
			customer_id,
			fingerprint,
		},
		auth,
	});
