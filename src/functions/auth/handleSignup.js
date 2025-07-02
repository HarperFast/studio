import isEmail from '../util/isEmail';
import addCustomer from '../api/lms/addCustomer';
import isAlphaNumeric from '../util/isAlphaNumeric';
import getUser from '../api/lms/getUser';

export default async ({ formData, theme }) => {
	const { firstname, lastname, email, subdomain, coupon_code, htuk, pageName, pageUri } = formData;

	if (!firstname || !lastname || !email || !subdomain) {
		return {
			error: 'All fields must be filled out',
		};
	}
	if (!isEmail(email)) {
		return {
			error: 'Please provide a valid email',
		};
	}

	if (!isAlphaNumeric(subdomain)) {
		return {
			error: 'subdomain: alphanumeric characters only',
		};
	}
	if (subdomain.length > 16) {
		return {
			error: 'subdomain: max 16 characters',
		};
	}

	if (
		theme === 'akamai' &&
		formData.email.indexOf('harperdb.io') === -1 &&
		formData.email.indexOf('akamai.com') === -1 &&
		formData.email.indexOf('walmart.com') === -1
	) {
		return {
			error: 'portal signup denied',
		};
	}

	const response = await addCustomer({
		firstname,
		lastname,
		email,
		customer_name: `${firstname}'s Org`,
		subdomain,
		coupon_code,
		htuk,
		pageName,
		pageUri,
	});
	if (response.error) {
		return {
			error: response.message.replace('Bad request: ', '').replace(/['"]+/g, ''),
		};
	}
	if (window._kmq) {
		window._kmq.push(['identify', email]);
		window._kmq.push(['record', 'successful_signup', { email, firstname, lastname }]);
	}

	if (response.temp_password) {
		return getUser({ email, pass: response.temp_password, loggingIn: true });
	}

	return { success: true };
};
