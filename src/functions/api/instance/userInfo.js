import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'user_info' },
		auth,
		url,
		timeout: 5000,
	});
