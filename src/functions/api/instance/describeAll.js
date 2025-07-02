import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'describe_all' },
		auth,
		url,
	});
