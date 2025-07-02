import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url, signal }) => {
	const result = await queryInstance({
		operation: { operation: 'list_users' },
		auth,
		url,
		signal,
	});
	const data = Array.isArray(result)
		? [...result]
				.map((u) => ({ username: u.username, role: u.role.role }))
				.sort((a, b) => (a.username.toLowerCase() > b.username.toLowerCase() ? 1 : -1))
		: [];

	instanceState.update((s) => {
		s.users = data;
	});

	return data;
};
