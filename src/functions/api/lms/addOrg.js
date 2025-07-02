import queryLMS from '../queryLMS';

export default async ({ auth, org, subdomain }) =>
	queryLMS({
		endpoint: 'addOrg',
		method: 'POST',
		auth,
		payload: {
			org,
			subdomain,
			user_id: auth.user_id,
		},
	});
