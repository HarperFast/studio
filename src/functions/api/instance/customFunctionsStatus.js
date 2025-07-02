import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'custom_functions_status' },
		auth,
		url,
		timeout: 5000,
	});
