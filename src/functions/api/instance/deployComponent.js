import queryInstance from '../queryInstance';

export default async ({ auth, url, project, packageUrl, payload }) => {
	if (payload) {
		return queryInstance({
			auth,
			url,
			operation: {
				operation: 'deploy_component',
				project,
				payload,
			},
		});
	}

	return queryInstance({
		auth,
		url,
		operation: {
			operation: 'deploy_component',
			project,
			package: packageUrl,
		},
	});
};
