import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';
import getUser from './getUser';

export default async ({ auth, firstname, lastname, customer_id, user_id, github_repo, email }) => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'updateUser',
			method: 'POST',
			payload: { firstname, lastname, customer_id, user_id, github_repo, email },
			auth,
		});

		if (response.error) {
			return appState.update((s) => {
				s.auth = { ...auth, ...response, profileError: Date.now() };
			});
		}

		appState.update((s) => {
			s.auth = { ...auth, profileSuccess: Date.now(), ...response };
		});

		return getUser({ email, pass: auth.pass, loggingIn: true });
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'updateUser',
			request: { firstname, lastname, customer_id, user_id, github_repo },
			error: { catch: e.toString() },
			customer_id,
		});
	}
};
