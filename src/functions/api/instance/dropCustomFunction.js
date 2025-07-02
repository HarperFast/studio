import queryInstance from '../queryInstance';

export default async ({ auth, url, project, type, file }) =>
	queryInstance({
		operation: { operation: 'drop_custom_function', project, type, file },
		auth,
		url,
	});
