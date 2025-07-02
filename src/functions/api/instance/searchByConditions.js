import queryInstance from '../queryInstance';

export default async ({
	auth,
	url,
	schema,
	table,
	operator,
	get_attributes,
	limit,
	offset,
	onlyCached,
	conditions,
	signal,
}) =>
	queryInstance({
		operation: {
			operation: 'search_by_conditions',
			schema,
			table,
			operator,
			get_attributes,
			limit,
			offset,
			conditions,
			onlyIfCached: onlyCached,
			noCacheStore: onlyCached,
		},
		auth,
		url,
		signal,
	});
