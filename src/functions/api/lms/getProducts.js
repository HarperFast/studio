import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import buildRadioSelectProductOptions from '../../products/buildRadioSelectProductOptions';
import buildRadioSelectStorageOptions from '../../products/buildRadioSelectStorageOptions';
import config from '../../../config';

// maps product type -> product type id (id is listed on stripe dashboard)
const PRODUCT_MAP = {
	dev: {
		cloud_compute: 'prod_Gh1XXQx6J8YaJl',
		local_compute: 'prod_GoB3yLzygPeGMu',
		wavelength_compute: 'prod_KloxOQofDaLs7q',
		akamai_compute: 'prod_O2DOH61yn3qP6g',
		cloud_storage: 'prod_GoUJnVwOYvTjU9',
	},
	stage: {
		cloud_compute: 'prod_Gh1XXQx6J8YaJl',
		local_compute: 'prod_GoB3yLzygPeGMu',
		wavelength_compute: 'prod_KloxOQofDaLs7q',
		akamai_compute: 'prod_O2DOH61yn3qP6g',
		cloud_storage: 'prod_GoUJnVwOYvTjU9',
	},
	prod: {
		cloud_compute: 'prod_GdDIHGH6lzEqgv',
		local_compute: 'prod_H0Xx9dKkQqhMx9',
		wavelength_compute: 'prod_KlorPRd9r1RKcz',
		akamai_compute: 'prod_O7j9wiS1g7kPZU',
		cloud_storage: 'prod_H0XnsrToBa7a7G',
	},
};

export default async () => {
	try {
		const response = await queryLMS({
			endpoint: 'getProducts',
			method: 'POST',
		});

		if (response.error) return false;

		return appState.update((s) => {
			s.products = {
				cloud_storage: buildRadioSelectStorageOptions(
					response
						.find((p) => p.id === PRODUCT_MAP[config.env].cloud_storage)
						?.plans.filter((p) => !p.metadata.prepaid) || []
				),
				cloud_compute: buildRadioSelectProductOptions(
					response
						.find((p) => p.id === PRODUCT_MAP[config.env].cloud_compute)
						?.plans.filter((p) => !p.metadata.prepaid) || []
				),
				wavelength_compute: buildRadioSelectProductOptions(
					response
						.find((p) => p.id === PRODUCT_MAP[config.env].wavelength_compute)
						?.plans.filter((p) => !p.metadata.prepaid) || []
				),
				akamai_compute: buildRadioSelectProductOptions(
					response
						.find((p) => p.id === PRODUCT_MAP[config.env].akamai_compute)
						?.plans.filter((p) => !p.metadata.prepaid) || []
				),
				local_compute: buildRadioSelectProductOptions(
					response
						.find((p) => p.id === PRODUCT_MAP[config.env].local_compute)
						?.plans.filter((p) => !p.metadata.prepaid) || []
				),
			};
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getProducts',
			error: { catch: e.toString() },
		});
	}
};
