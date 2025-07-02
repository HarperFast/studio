import queryInstance from '../queryInstance';

export default async ({ auth, url, id, permission }) =>
	queryInstance({
		operation: {
			operation: 'alter_role',
			id,
			permission,
		},
		auth,
		url,
	});
