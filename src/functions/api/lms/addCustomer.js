import queryLMS from '../queryLMS';

export default async ({
	firstname,
	lastname,
	email,
	customer_name,
	subdomain,
	coupon_code,
	htuk,
	pageName,
	pageUri,
	login_domain = window.location.host,
}) =>
	queryLMS({
		endpoint: 'addCustomer',
		method: 'POST',
		payload: {
			firstname,
			lastname,
			email,
			customer_name,
			subdomain,
			coupon_code,
			htuk,
			pageName,
			pageUri,
			login_domain,
		},
	});
