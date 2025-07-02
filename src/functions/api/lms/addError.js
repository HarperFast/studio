import { fetch } from 'whatwg-fetch';
import config from '../../../config';

export default async ({
	type = 'studio component',
	status = 'warn',
	url = undefined,
	operation = undefined,
	request = undefined,
	error,
	customer_id = undefined,
	compute_stack_id = undefined,
}) => {
	let user = false;
	try {
		user = JSON.parse(localStorage.getItem('persistedUser'));

		const body = {
			type,
			status: type === 'studio component' ? 'warn' : status,
			environment: config.env,
			user: user?.email || 'unknown',
			customer_id,
			compute_stack_id,
			url,
			operation,
			request: { ...request, password: request?.password ? 'xxxxxxxxx' : undefined },
			error,
			timestamp: Date.now(),
		};

		const result = await fetch(`${config.lms_api_url}addError`, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type': 'application/json',
				'authorization': undefined,
			},
		});

		const json = await result.json();

		const response = json.body || json;

		if (!response.error) {
			// eslint-disable-next-line
			console.log('Reported ', config.env, body.status, type, operation);
		}
	} catch (e) {
		// eslint-disable-next-line
		console.log(e);
	}
};
