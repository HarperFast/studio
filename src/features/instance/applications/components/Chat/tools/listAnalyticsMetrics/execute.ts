import { listAnalyticsMetrics } from '@/integrations/api/instance/status/listAnalyticsMetrics';
import { inputSchema } from '@harperfast/agent-tools/tools/listAnalyticsMetrics/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const { metricTypes, customWindowMS } = input;

		const data = await listAnalyticsMetrics({
			metricTypes,
			customWindowMS,
			instanceParams: instanceClientParams,
		});

		return {
			success: true,
			metricNames: data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error retrieving analytics: ${err}`,
		};
	}
}
