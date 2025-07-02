import queryInstance from '../queryInstance';

export default async ({
	auth,
	url,
	schema,
	table,
	search_attribute,
	search_value,
	get_attributes,
	limit,
	offset,
	sort,
	onlyCached,
	signal,
}) =>
	queryInstance({
		operation: {
			operation: 'search_by_value',
			schema,
			table,
			search_attribute,
			search_value,
			get_attributes,
			limit,
			offset,
			sort,
			onlyIfCached: onlyCached,
			noCacheStore: onlyCached,
		},
		auth,
		url,
		signal,
	});
