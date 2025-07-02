import queryLMS from '../queryLMS';

export default async ({ auth, user_id, customer_id }) =>
	queryLMS({
		endpoint: 'removeOrg',
		method: 'POST',
		payload: { user_id, customer_id },
		auth,
	});
