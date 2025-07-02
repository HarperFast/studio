import queryInstance from '../queryInstance';

// for hdb version 3.3.0

export default async ({ CLUSTERING = false, CLUSTERING_PORT, CLUSTERING_USER, NODE_NAME, auth, url }) =>
	queryInstance({
		operation: {
			operation: 'configure_cluster',
			CLUSTERING,
			CLUSTERING_PORT,
			CLUSTERING_USER,
			NODE_NAME,
		},
		auth,
		url,
	});
