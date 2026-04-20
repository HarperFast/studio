import { deleteTableRecords } from '@/integrations/api/instance/database/deleteTableRecords';
import { queryClient } from '@/react-query/queryClient';
import { inputSchema } from '@harperfast/agent-tools/tools/deleteTableRecords/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { database, table, primaryKeys }, instanceClientParams, params }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await deleteTableRecords({
			...instanceClientParams,
			databaseName: database,
			tableName: table,
			hashValues: primaryKeys,
		});
		const { databaseName, tableName } = params;
		await queryClient.invalidateQueries({ queryKey: [instanceClientParams.entityId, databaseName, tableName] });
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
