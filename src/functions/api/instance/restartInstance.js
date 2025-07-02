import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url }) => {
	instanceState.update((s) => {
		s.restarting = true;
	});

	return queryInstance({
		operation: {
			operation: 'restart',
		},
		auth,
		url,
	});
};
