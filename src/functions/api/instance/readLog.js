import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url, signal, logsFilter }) => {
	const logs = await queryInstance({
		operation: {
			operation: 'read_log',
			start: 0,
			...logsFilter,
			order: 'desc',
		},
		auth,
		url,
		signal,
	});

	return instanceState.update((s) => {
		s.logs = logs.error ? [] : logs?.filter((log) => log.message) || [];
		s.logsError = false;
	});
};
