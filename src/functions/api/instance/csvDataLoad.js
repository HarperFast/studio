import queryInstance from '../queryInstance';

export default async ({ schema, table, csv_file, auth, url }) =>
	queryInstance({
		operation: {
			operation: 'csv_data_load',
			action: 'insert',
			transact_to_cluster: true,
			schema,
			table,
			data: csv_file,
		},
		auth,
		url,
	});
