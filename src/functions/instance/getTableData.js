import describeTable from '../api/instance/describeTable';
import searchByValue from '../api/instance/searchByValue';
import searchByConditions from '../api/instance/searchByConditions';
import { getTableDescriptionFromCache, setTableDescriptionInCache } from './state/describeTableCache';

const getAttributesFromTableData = (tableData, existingAttributes) => {
	if (!tableData.length) return [];
	if (existingAttributes.length >= 8) return [];
	const existing = new Map(existingAttributes.map((value, index) => [value, index]));
	const extra = new Map();
	for (const dataRow of tableData) {
		for (const key of Object.keys(dataRow)) {
			if (!existing.has(key)) {
				const count = extra.get(key) || 0;
				extra.set(key, count + 1);
			}
		}
	}
	return Array.from(extra)
		.sort(([, a], [, b]) => b - a)
		.map(([key]) => key)
		.slice(0, 8 - existingAttributes.length);
};

export default async ({ schema, table, filtered, pageSize, onlyCached, sorted, page, auth, url, signal, signal2 }) => {
	let fetchError = false;
	let newTotalRecords = 0;
	let newTotalPages = 1;
	let newData = [];
	let allAttributes = false;
	let hashAttribute = false;
	let schemaAttributes = [];
	let get_attributes = ['*'];
	let dynamicAttributesFromDataTable = [];
	const offset = page * pageSize;

	try {
		let result = getTableDescriptionFromCache(schema, table);
		if (!result) {
			result = await describeTable({ auth, url, schema, table, signal: signal2 });
			setTableDescriptionInCache(schema, table, result);
		}

		if (result.error) {
			allAttributes = [];
			throw new Error('table');
		}

		const { record_count, attributes, hash_attribute } = result;
		schemaAttributes = attributes;
		allAttributes = attributes.map((a) => a.attribute);
		if (hash_attribute === undefined) {
			hashAttribute = '$id';
			get_attributes = ['$id', '*'];
		} else {
			hashAttribute = hash_attribute;
		}

		newTotalRecords = record_count;
		schemaAttributes = attributes;
		newTotalPages = newTotalRecords && Math.ceil(newTotalRecords / pageSize);
	} catch (e) {
		fetchError = e.message;
	}

	if (newTotalRecords) {
		try {
			if (filtered.length) {
				newData = await searchByConditions({
					schema,
					table,
					operator: 'and',
					get_attributes,
					limit: pageSize,
					offset,
					sort: sorted.length ? { attribute: sorted[0].id, descending: sorted[0].desc } : undefined,
					conditions: filtered.map((f) => ({ search_attribute: f.id, search_type: 'contains', search_value: f.value })),
					auth,
					url,
					signal,
					onlyCached,
				});
			} else {
				newData = await searchByValue({
					schema,
					table,
					search_attribute: hashAttribute,
					search_value: '*',
					get_attributes,
					limit: pageSize,
					offset,
					sort: sorted.length ? { attribute: sorted[0].id, descending: sorted[0].desc } : undefined,
					auth,
					url,
					signal,
					onlyCached,
				});
			}
			if (newData.error || !Array.isArray(newData)) {
				throw new Error(newData.message);
			}
		} catch (e) {
			fetchError = e.message;
		}
	}

	dynamicAttributesFromDataTable = getAttributesFromTableData(newData, allAttributes);
	allAttributes.push(...dynamicAttributesFromDataTable);
	// sort columns, but keep primary key / hash attribute first, and created and updated last.
	// NOTE: __created__ and __updated__ might not exist in the schema, only include if they exist.
	const orderedColumns = allAttributes.filter(
		(a) => ![hashAttribute, '__createdtime__', '__updatedtime__'].includes(a)
	);
	const newEntityAttributes = orderedColumns.reduce((ac, a) => ({ ...ac, [a]: null }), {});

	if (allAttributes.includes('__createdtime__')) orderedColumns.push('__createdtime__');
	if (allAttributes.includes('__updatedtime__')) orderedColumns.push('__updatedtime__');

	const dataTableColumns = (hashAttribute ? [hashAttribute, ...orderedColumns] : [...orderedColumns]).map((k) => ({
		Header: k === '$id' ? 'Primary Key' : k.toString(),
		accessor: (row) => row[k.toString()],
	}));

	return {
		newData: newData || [],
		newEntityAttributes,
		newTotalRecords,
		newTotalPages,
		hashAttribute,
		schemaAttributes,
		dataTableColumns,
		error: fetchError === 'table' ? `You are not authorized to view ${schema}:${table}` : fetchError,
		dynamicAttributesFromDataTable,
	};
};
