import { getDescribeTable } from '@/integrations/api/instance/database/getDescribeTable';
import { inputSchema } from '@harperfast/agent-tools/tools/getDescribeTable/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input: { database, table }, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await getDescribeTable({ ...instanceClientParams, databaseName: database, tableName: table });
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
