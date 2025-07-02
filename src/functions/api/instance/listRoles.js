import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url }) => {
	const result = await queryInstance({
		operation: { operation: 'list_roles' },
		auth,
		url,
	});

	const data = Array.isArray(result) ? result : [];

	const roles = [...data].sort((a, b) => (a.role.toLowerCase() > b.role.toLowerCase() ? 1 : -1));

	instanceState.update((s) => {
		s.roles = roles;
	});

	return roles;
};
