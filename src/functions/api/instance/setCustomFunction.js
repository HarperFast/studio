import queryInstance from '../queryInstance';

export default async ({ auth, url, function_content, project, type, file }) =>
	queryInstance({
		operation: { operation: 'set_custom_function', function_content, project, type, file },
		auth,
		url,
	});
