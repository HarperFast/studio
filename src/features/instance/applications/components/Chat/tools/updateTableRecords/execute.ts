import { updateTableRecords } from '@/integrations/api/instance/database/updateTableRecords';
import { queryClient } from '@/react-query/queryClient';
import { inputSchema } from '@harperfast/agent-tools/tools/updateTableRecords/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { database, table, records }, instanceClientParams, params }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await updateTableRecords({
			...instanceClientParams,
			databaseName: database,
			tableName: table,
			records,
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
