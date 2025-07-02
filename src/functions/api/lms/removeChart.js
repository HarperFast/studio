import queryLMS from '../queryLMS';

export default async ({ auth, customer_id, compute_stack_id, id }) =>
	queryLMS({
		endpoint: 'removeChart',
		method: 'POST',
		payload: { user_id: auth.user_id, customer_id, compute_stack_id, id },
		auth,
	});
