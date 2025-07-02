import queryInstance from '../queryInstance';

export default async ({ auth, url }) => {
	const { message } = await queryInstance({
		operation: { operation: 'get_fingerprint' },
		auth,
		url,
	});
	return message;
};
