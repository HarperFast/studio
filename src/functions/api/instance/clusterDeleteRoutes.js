import queryInstance from '../queryInstance';

export default async ({ auth, url, routes }) =>
	queryInstance({
		operation: { operation: 'cluster_delete_routes', routes },
		auth,
		url,
	});
