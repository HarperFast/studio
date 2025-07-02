import sql from '../api/instance/sql';

export default async ({ query, auth, url, signal }) => {
	try {
		const response = await sql({ sql: query, auth, url, signal });

		if (response.error) {
			return {
				message: response.message,
				error: true,
				access_errors: response.access_errors,
			};
		}

		if (response.message) {
			return {
				message: response.message,
			};
		}

		const totalRecords = response.length;
		const attributes = totalRecords ? Object.keys(response[0]) : [];

		const orderedColumns = attributes.filter((a) => !['__createdtime__', '__updatedtime__'].includes(a)).sort();

		if (attributes.includes('__createdtime__')) orderedColumns.push('__createdtime__');
		if (attributes.includes('__updatedtime__')) orderedColumns.push('__updatedtime__');

		const dataTableColumns = orderedColumns.map((k) => ({
			Header: k.toString(),
			accessor: (row) => row[k.toString()],
		}));

		return {
			tableData: response,
			totalRecords,
			dataTableColumns,
		};
	} catch (e) {
		return {
			message: e,
			error: true,
		};
	}
};
