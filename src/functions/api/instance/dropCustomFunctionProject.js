import queryInstance from '../queryInstance';

export default async ({ auth, url, project }) =>
	queryInstance({
		operation: { operation: 'drop_custom_function_project', project },
		auth,
		url,
	});
