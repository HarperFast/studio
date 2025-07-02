import queryInstance from '../queryInstance';

export default async ({ auth, role, username, password, url }) =>
	queryInstance({
		operation: {
			operation: 'add_user',
			role,
			username,
			password,
			active: true,
		},
		auth,
		url,
	});
