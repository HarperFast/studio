import queryInstance from '../queryInstance';

export default async ({ auth, url, project, skip_node_modules = true }) =>
	queryInstance({
		auth,
		url,
		operation: {
			operation: 'package_component',
			project,
			skip_node_modules,
		},
	});
