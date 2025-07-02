import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'get_custom_functions' },
		auth,
		url,
	});
