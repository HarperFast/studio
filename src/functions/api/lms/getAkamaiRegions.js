// import queryLMS from '../queryLMS';
import appState from '../../state/appState';
import addError from './addError';
import config from '../../../config';

export default async () => {
	let response = null;

	try {
		response = [
			{
				value: 'ap-west',
				label: 'Mumbai, IN',
				country: 'in',
			},
			{
				value: 'ca-central',
				label: 'Toronto, CA',
				country: 'ca',
			},
			{
				value: 'ap-southeast',
				label: 'Sydney, AU',
				country: 'au',
			},
			{
				value: 'us-central',
				label: 'Dallas, TX',
				country: 'us',
			},
			{
				value: 'us-ord',
				label: 'Chicago, IL',
				country: 'us',
			},
			{
				value: 'us-west',
				label: 'Fremont, CA',
				country: 'us',
			},
			{
				value: 'us-southeast',
				label: 'Atlanta, GA',
				country: 'us',
			},
			{
				value: 'us-east',
				label: 'Newark, NJ',
				country: 'us',
			},
			{
				value: 'us-lax',
				label: 'Los Angeles, CA',
				country: 'us',
			},
			{
				value: 'us-mia',
				label: 'Miami, FL',
				country: 'us',
			},
			{
				value: 'us-sea',
				label: 'Seattle, WA',
				country: 'us',
			},
			{
				value: 'us-iad',
				label: 'Washington, DC',
				country: 'us',
			},
			{
				value: 'eu-west',
				label: 'London, UK',
				country: 'uk',
			},
			{
				value: 'ap-south',
				label: 'Singapore, SG',
				country: 'sg',
			},
			{
				value: 'eu-central',
				label: 'Frankfurt, DE',
				country: 'de',
			},
			{
				value: 'ap-northeast',
				label: 'Tokyo, JP',
				country: 'jp',
			},
			{
				value: 'se-sto',
				label: 'Stockholm, SE',
				country: 'se',
			},
			{
				value: 'nl-ams',
				label: 'Amsterdam, NL',
				country: 'nl',
			},
			{
				value: 'fr-par',
				label: 'Paris, FR',
				country: 'fr',
			},
			{
				value: 'es-mad',
				label: 'Madrid, ES',
				country: 'es',
			},
			{
				value: 'jp-osa',
				label: 'Osaka, JP',
				country: 'jp',
			},
			{
				value: 'in-maa',
				label: 'Chennai, IN',
				country: 'in',
			},
			{
				value: 'id-cgk',
				label: 'Jakarta, ID',
				country: 'id',
			},
			{
				value: 'br-gru',
				label: 'São Paulo, BR',
				country: 'br',
			},
			{
				value: 'br-gru',
				label: 'São Paulo, BR',
				country: 'br',
			},
		].sort((a, b) => (a.label < b.label ? -1 : 1));

		let regions = [];

		if (Array.isArray(response)) {
			regions = response;
		}

		return appState.update((s) => {
			s.akamaiRegions = regions;
		});
	} catch (e) {
		return addError({
			type: 'lms data',
			status: 'error',
			url: config.lms_api_url,
			operation: 'getAkamaiRegions',
			error: { catch: e.toString() },
		});
	}
};
