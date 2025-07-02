import queryInstance from '../queryInstance';

export default async ({ auth, url, project, file }) =>
	queryInstance({
		operation: {
			operation: 'get_component_file',
			project,
			file,
		},
		auth,
		url,
	});
