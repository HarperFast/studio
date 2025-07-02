import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';

export default async ({ auth, signal, customer_id }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'getInvoices',
			method: 'POST',
			payload: { customer_id },
			signal,
			auth,
		});

		let invoices = [];

		if (Array.isArray(response)) {
			invoices = response;
		}

		return appState.update((s) => {
			s.invoices = invoices.filter((i) => i.amount_paid);
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getInvoices',
			request: { customer_id },
			error: { catch: e.toString() },
			customer_id,
		});
	}
};
