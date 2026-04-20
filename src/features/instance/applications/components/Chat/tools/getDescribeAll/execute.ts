import { getDescribeAll } from '@/integrations/api/instance/database/getDescribeAll';
import { inputSchema } from '@harperfast/agent-tools/tools/getDescribeAll/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await getDescribeAll(instanceClientParams);
		return {
			success: true,
			map: data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error: ${err}`,
		};
	}
}
