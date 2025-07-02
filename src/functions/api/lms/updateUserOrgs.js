import queryLMS from '../queryLMS';

export default async ({ auth, customer_id, user_id, status }) =>
	queryLMS({
		endpoint: 'updateUserOrgs',
		method: 'POST',
		payload: {
			customer_id,
			user_id,
			status,
		},
		auth,
	});
