import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';
import getPrepaidSubscriptions from './getPrepaidSubscriptions';

export default async ({ auth, customer_id }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'getCustomer',
			method: 'POST',
			payload: { customer_id },
			auth,
		});

		getPrepaidSubscriptions({ auth, customer_id, stripe_id: response?.stripe_id });

		if (!response.error) {
			appState.update((s) => {
				s.customer = { ...response, customer_id };
				s.hasCard = response.stripe_payment_methods?.[0];
			});
		}

		return response;
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getCustomer',
			request: { customer_id },
			error: { catch: e.toString() },
			customer_id,
		});
	}
};
