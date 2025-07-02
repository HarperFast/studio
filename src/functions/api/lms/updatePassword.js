import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';

export default async ({ auth, user_id, password }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'updatePassword',
			method: 'POST',
			payload: { user_id, password, loggingIn: true },
			auth,
		});

		if (response.error) {
			const newAuth = { ...auth, ...response, passwordError: Date.now() };
			appState.update((s) => {
				s.auth = newAuth;
			});
			return newAuth;
		}

		const newAuth = { ...auth, passwordSuccess: Date.now(), update_password: false, ...response, pass: password };

		appState.update((s) => {
			s.auth = newAuth;
		});

		return newAuth;
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'updatePassword',
			request: { user_id },
			error: { catch: e.toString() },
		});
	}
};
