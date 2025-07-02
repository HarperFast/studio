import queryLMS from '../queryLMS';

export default async ({ auth, customer_id, user_id, user_id_owner, status }) =>
	queryLMS({
		endpoint: 'updateOrgUser',
		method: 'POST',
		payload: {
			customer_id,
			user_id,
			user_id_owner,
			status,
		},
		auth,
	});
