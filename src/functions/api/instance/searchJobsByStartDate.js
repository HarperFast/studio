import queryInstance from '../queryInstance';
import instanceState from '../../state/instanceState';

export default async ({ auth, url, signal, from_date, to_date, currentJobCount }) => {
	const result = await queryInstance({
		operation: { operation: 'search_jobs_by_start_date', from_date, to_date },
		auth,
		url,
		signal,
	});

	if (result.error && currentJobCount) {
		return instanceState.update((s) => {
			s.jobsError = true;
		});
	}

	if (!Array.isArray(result) || result.error) {
		return instanceState.update((s) => {
			s.jobs = [];
			s.jobsError = true;
		});
	}

	return instanceState.update((s) => {
		s.jobs = [...result].sort((a, b) => b.start_datetime - a.end_datetime);
		s.jobsError = false;
	});
};
