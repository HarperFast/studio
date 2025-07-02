const descriptionCache = new Map();

const getTableKey = (schema, table) => `${schema}/${table}`;

const getTableDescriptionFromCache = (schema, table) => {
	const tableKey = getTableKey(schema, table);
	return descriptionCache.get(tableKey) ?? undefined;
};

const setTableDescriptionInCache = (schema, table, description) => {
	const tableKey = getTableKey(schema, table);
	descriptionCache.set(tableKey, description);
};

const clearTableDescriptionCache = () => {
	if (!descriptionCache.size) return;
	descriptionCache.clear();
};

export { descriptionCache, getTableDescriptionFromCache, setTableDescriptionInCache, clearTableDescriptionCache };
