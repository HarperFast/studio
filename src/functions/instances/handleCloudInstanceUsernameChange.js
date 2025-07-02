import listRoles from '../api/instance/listRoles';
import addUser from '../api/instance/addUser';
import dropUser from '../api/instance/dropUser';

export default async ({ instance_id, instanceAuth, url }) => {
	const roles = await listRoles({
		auth: {
			user: instance_id,
			pass: instance_id,
		},
		url,
	});

	if (roles.error || !roles.length) {
		return false;
	}

	const { role } = roles.find((r) => r.permission.super_user);

	await addUser({
		auth: {
			user: instance_id,
			pass: instance_id,
		},
		role,
		username: instanceAuth.user,
		password: instanceAuth.pass,
		url,
	});
	await dropUser({
		auth: instanceAuth,
		username: instance_id,
		url,
	});

	return true;
};
