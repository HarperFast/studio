import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import buildRadioSelectProductOptions from '../../products/buildRadioSelectProductOptions';
import buildRadioSelectStorageOptions from '../../products/buildRadioSelectStorageOptions';
import config from '../../../config';

export default async ({ auth, customer_id, stripe_id }) => {
	try {
		const response = await queryLMS({
			endpoint: 'getPrepaidSubscriptions',
			method: 'POST',
			payload: {
				customer_id,
				stripe_id,
			},
			auth,
		});

		if (response.error) return false;

		return appState.update((s) => {
			s.subscriptions = {
				cloud_storage: buildRadioSelectStorageOptions(response.cloud_storage || []),
				cloud_compute: buildRadioSelectProductOptions(response.cloud_compute || []),
				wavelength_compute: buildRadioSelectProductOptions(response.wavelength_compute || []),
				local_compute: buildRadioSelectProductOptions(response.local_compute || []),
			};
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getPrepaidSubscriptions',
			error: { catch: e.toString() },
		});
	}
};
