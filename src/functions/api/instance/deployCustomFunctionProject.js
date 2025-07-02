import queryInstance from '../queryInstance';

export default async ({ auth, url, project, payload, file }) =>
	queryInstance({
		operation: { operation: 'deploy_custom_function_project', project, payload, file },
		auth,
		url,
	});
