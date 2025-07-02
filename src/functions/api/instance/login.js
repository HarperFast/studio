import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'login', username: auth.user, password: auth.pass },
		// NOTE - remove auth from the queryInstance call due to not wanting to save it in the instance auth
		// auth,
		url,
		timeout: 5000,
	});
