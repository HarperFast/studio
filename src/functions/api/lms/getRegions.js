import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';

export default async () => {
	let response = null;

	try {
		response = await queryLMS({
			endpoint: 'getRegions',
			method: 'POST',
		});

		let regions = [];

		if (Array.isArray(response)) {
			regions = response;
		}

		return appState.update((s) => {
			s.regions = regions;
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getRegions',
			error: { catch: e.toString() },
		});
	}
};
