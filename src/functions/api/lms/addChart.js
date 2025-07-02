import queryLMS from '../queryLMS';

export default async ({
	auth,
	customer_id,
	compute_stack_id,
	name,
	type,
	query,
	labelAttribute,
	seriesAttributes,
	shared,
}) =>
	queryLMS({
		endpoint: 'addChart',
		method: 'POST',
		auth,
		payload: {
			user_id: auth.user_id,
			customer_id,
			compute_stack_id,
			name,
			type,
			query,
			labelAttribute,
			seriesAttributes,
			shared,
		},
	});
