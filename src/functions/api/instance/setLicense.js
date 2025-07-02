import queryInstance from '../queryInstance';

export default async ({ auth, key, company, url }) =>
	queryInstance({
		operation: {
			operation: 'set_license',
			key,
			company,
		},
		auth,
		url,
	});
