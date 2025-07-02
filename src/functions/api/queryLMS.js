import { fetch } from 'whatwg-fetch';
import config from '../../config';
import addError from './lms/addError';

export default async ({ endpoint, payload, auth, signal = undefined }) => {
	// console.log('Querying LMS API', endpoint);
	const errorObject = {
		type: 'lms api',
		status: 'error',
		url: config.lms_api_url,
		operation: endpoint,
		request: payload,
		customer_id: payload?.customer_id,
		compute_stack_id: payload?.compute_stack_id,
	};

	try {
		const request = await fetch(`${config.lms_api_url}${endpoint}`, {
			signal,
			method: 'POST',
			body: JSON.stringify(payload),
			headers:
				auth?.email && auth?.pass
					? {
							'Content-Type': 'application/json',
							'authorization': `Basic ${btoa(`${auth.email}:${auth.pass}`)}`,
						}
					: {
							'Content-Type': 'application/json',
						},
		});

		const json = await request.json();

		const response = json.body || json;

		if (response.errorType) {
			addError({ ...errorObject, status: 'warn', error: response });

			return {
				error: true,
				message: response.errorMessage,
			};
		}

		if (response.error || response.message === 'Internal server error') {
			if (!payload.loggingIn) {
				addError({ ...errorObject, error: response });
			}

			return {
				error: true,
				message:
					response.message
						.replace(
							/Validation error:|Throttling error:|Bad request:|Internal Server Error:|Unauthorized:|StripeInvalidRequestError:|TypeError:/g,
							''
						)
						.trim() || 'The server did not respond',
			};
		}

		return response;
	} catch (e) {
		if (!['Aborted', 'Network request failed'].includes(e.message) && e !== 'TypeError: Network request failed') {
			addError({ ...errorObject, error: { catch: e.message } });
		}

		return {
			error: true,
			message: e.message,
		};
	}
};
