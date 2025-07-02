import queryInstance from '../queryInstance';

export default async ({ auth, url, username, password = undefined, role = undefined }) =>
	queryInstance({
		operation: {
			operation: 'alter_user',
			role,
			username,
			password,
			active: true,
		},
		auth,
		url,
	});
