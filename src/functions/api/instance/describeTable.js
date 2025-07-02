import queryInstance from '../queryInstance';

export default async ({ auth, url, schema, table, signal }) =>
	queryInstance({
		operation: { operation: 'describe_table', schema, table },
		auth,
		url,
		signal,
	});
