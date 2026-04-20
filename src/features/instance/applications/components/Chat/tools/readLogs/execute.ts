import { getReadLog } from '@/integrations/api/instance/status/getReadLog';
import { inputSchema } from '@harperfast/agent-tools/tools/readLogs/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const data = await getReadLog({
			...instanceClientParams,
			logFilters: input,
			replicated: instanceClientParams.entityType === 'cluster',
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
