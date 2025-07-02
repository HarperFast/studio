import queryInstance from '../queryInstance';

export default async ({ schema, table, csv_url, auth, url }) =>
	queryInstance({
		operation: {
			operation: 'csv_url_load',
			action: 'insert',
			transact_to_cluster: true,
			schema,
			table,
			csv_url,
		},
		auth,
		url,
	});
