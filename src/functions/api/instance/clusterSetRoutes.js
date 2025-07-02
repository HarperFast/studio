import queryInstance from '../queryInstance';

export default async ({ auth, url, server = 'hub', routes }) =>
	queryInstance({
		operation: { operation: 'cluster_set_routes', server, routes },
		auth,
		url,
	});
