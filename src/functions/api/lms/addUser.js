import queryLMS from '../queryLMS';

export default async ({ auth, email, customer_id, login_domain = window.location.host }) =>
	queryLMS({
		endpoint: 'addUser',
		method: 'POST',
		payload: {
			email,
			customer_id,
			login_domain,
			user_id: auth.user_id,
		},
		auth,
	});
