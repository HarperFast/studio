import queryInstance from '../queryInstance';

export default async ({ auth, url }) =>
	queryInstance({
		operation: { operation: 'cluster_get_routes' },
		auth,
		url,
	});
