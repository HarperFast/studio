export default (dbResponse) => {
	const structure = {};
	const defaultBrowseURL = [];

	if (!dbResponse.error) {
		Object.keys(dbResponse)
			.sort()
			.forEach((schema, s) => {
				structure[schema] = {};
				if (s === 0) defaultBrowseURL.push(schema);
				Object.keys(dbResponse[schema])
					.sort()
					.forEach((table, t) => {
						if (t === 0 && s === 0) defaultBrowseURL.push(table);
						structure[schema][table] = {
							record_count: dbResponse[schema][table].record_count,
							hashAttribute: dbResponse[schema][table].hash_attribute,
						};
					});
			});
	}

	return {
		structure,
		defaultBrowseURL: defaultBrowseURL.join('/'),
	};
};
