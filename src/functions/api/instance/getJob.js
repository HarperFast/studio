import queryInstance from '../queryInstance';

export default async ({ auth, url, id }) =>
	queryInstance({
		operation: { operation: 'get_job', id },
		auth,
		url,
	});
