import queryInstance from '../queryInstance';

export default async ({ auth, url, project, file, payload }) =>
	queryInstance({
		operation: {
			operation: 'set_component_file',
			project,
			file,
			payload,
		},
		auth,
		url,
	});
