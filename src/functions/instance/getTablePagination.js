import sql from '../api/instance/sql';

export default async ({ schema, table, filtered, pageSize, auth, url, signal }) => {
	let newTotalPages;
	let newTotalRecords;

	try {
		let countSQL = `SELECT count(*) as newTotalRecords FROM \`${schema}\`.\`${table}\` `;
		if (filtered.length) countSQL += `WHERE ${filtered.map((f) => ` \`${f.id}\` LIKE '%${f.value}%'`).join(' AND ')}`;
		[{ newTotalRecords }] = await sql({ auth, url, sql: countSQL, signal });
		newTotalPages = newTotalRecords && Math.ceil(newTotalRecords / pageSize);
		// eslint-disable-next-line
	} catch (e) {
		newTotalPages = 1;
		newTotalRecords = 0;
	}

	return {
		newTotalRecords,
		newTotalPages,
	};
};
