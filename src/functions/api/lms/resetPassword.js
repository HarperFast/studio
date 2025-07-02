import queryLMS from '../queryLMS';

export default async ({ email, login_domain = window.location.host }) =>
	queryLMS({
		endpoint: 'resetPassword',
		method: 'POST',
		payload: { email, login_domain },
	});
