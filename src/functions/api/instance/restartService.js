import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url, service = null }) => {
	if (!service) {
		return { error: true, message: 'You must specify a service' };
	}

	instanceState.update((s) => {
		s.restarting_service = service;
	});

	return queryInstance({
		operation: {
			operation: 'restart_service',
			service,
		},
		auth,
		url,
	});
};
