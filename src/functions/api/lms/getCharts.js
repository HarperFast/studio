import queryLMS from '../queryLMS';
import instanceState from '../../state/instanceState';
import addError from './addError';
import config from '../../../config';

export default async ({ auth, customer_id, compute_stack_id, signal }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'getCharts',
			method: 'POST',
			payload: { customer_id, compute_stack_id, user_id: auth.user_id },
			auth,
			signal,
		});

		if (!response.error) {
			instanceState.update((s) => {
				s.charts = response;
			});
		}

		return response;
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getCharts',
			request: { customer_id, compute_stack_id, user_id: auth.user_id },
			error: { catch: e.toString() },
			customer_id,
		});
	}
};
