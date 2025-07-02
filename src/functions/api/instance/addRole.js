import queryInstance from '../queryInstance';

export default async ({ auth, url, role, permission }) =>
	queryInstance({
		operation: {
			operation: 'add_role',
			role,
			permission,
		},
		auth,
		url,
	});
