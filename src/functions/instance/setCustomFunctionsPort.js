import queryInstance from '../api/queryInstance';

export default async ({ auth, url, port }) =>
	queryInstance({
		operation: {
			operation: 'configure_cluster',
			CUSTOM_FUNCTIONS_PORT: parseInt(port, 10),
		},
		auth,
		url,
	});
