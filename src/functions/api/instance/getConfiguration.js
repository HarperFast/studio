import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'get_configuration' },
		auth,
		url,
	});
