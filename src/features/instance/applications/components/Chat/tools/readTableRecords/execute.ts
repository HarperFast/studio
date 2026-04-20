import { getSearchByConditions } from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
import { inputSchema } from '@harperfast/agent-tools/tools/readTableRecords/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { database, table, conditions, primaryKey, ...otherParams }, instanceClientParams }: ExecuteParams<
		z.infer<typeof inputSchema>
	>,
): Promise<Output> {
	try {
		if (!conditions.length) {
			const { data } = await getSearchByValue({
				...instanceClientParams,
				databaseName: database,
				tableName: table,
				onlyIfCached: true,
				searchAttribute: primaryKey,
				...otherParams,
			});
			return {
				success: true,
				data,
			};
		}
		const { data } = await getSearchByConditions({
			...instanceClientParams,
			databaseName: database,
			tableName: table,
			onlyIfCached: true,
			conditions,
			...otherParams,
		});
		return {
			success: true,
			data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error: ${err}`,
		};
	}
}
