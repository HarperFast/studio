import addOrg from '../api/lms/addOrg';
import isAlphaNumeric from '../util/isAlphaNumeric';

export default async ({ formData, auth }) => {
	const { org, subdomain } = formData;

	if (!org || !subdomain) {
		return {
			error: 'All fields must be filled out',
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

	const response = await addOrg({
		auth,
		org,
		subdomain,
	});
	if (response.error) {
		return {
			error: response.message.replace('Bad request: ', '').replace(/['"]+/g, ''),
		};
	}
	return { success: true };
};
