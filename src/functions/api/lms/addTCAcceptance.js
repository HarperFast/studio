import queryLMS from '../queryLMS';

export default async ({ auth, user_id, tc_version, customer_id }) =>
	queryLMS({
		endpoint: 'addTCAcceptance',
		method: 'POST',
		payload: {
			user_id,
			tc_version,
			customer_id,
		},
		auth,
	});
