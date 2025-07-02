import queryInstance from '../queryInstance';

export default async ({ auth, url, project, skip_node_modules }) =>
	queryInstance({
		operation: { operation: 'package_custom_function_project', project, skip_node_modules },
		auth,
		url,
	});
