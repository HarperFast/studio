import queryInstance from '../queryInstance';

export default async ({ auth, url, ...rest }) =>
	queryInstance({
		operation: {
			operation: 'set_configuration',
			...rest,
		},
		auth,
		url,
	});
