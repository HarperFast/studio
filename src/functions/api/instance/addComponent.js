import queryInstance from '../queryInstance';

export default async ({ auth, url, project }) =>
	queryInstance({
		operation: {
			operation: 'add_component',
			project,
		},
		auth,
		url,
	});
