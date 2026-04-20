import { getAnalytics, MetricConfig } from '@/integrations/api/instance/status/getAnalytics';
import { inputSchema } from '@harperfast/agent-tools/tools/getAnalytics/inputSchema';
import { z } from 'zod';
import { ExecuteParams } from '../../types/executeParams';
import { Output } from './output';

export async function execute(
	{ input, instanceClientParams }: ExecuteParams<z.infer<typeof inputSchema>>,
): Promise<Output> {
	try {
		const { metricName, path, startTime, endTime } = input;

		// To call getAnalytics, we need a MetricConfig.
		// Since getAnalytics internally uses metricConfig.name and metricConfig.path,
		// we can provide a minimal implementation of MetricConfig.
		const metricConfig: MetricConfig = {
			id: 'chat-tool-metric', // dummy id
			name: metricName,
			path,
			// The following properties are required by MetricConfig but not used by getAnalytics
			dataKey: 'count',
			aggregator: (a, b) => a + b,
			units: 'reads',
		};

		const data = await getAnalytics({
			metricConfig,
			startTime,
			endTime,
			instanceParams: instanceClientParams,
		});

		return {
			success: true,
			data,
		};
	} catch (err) {
		return {
			success: false,
			message: `Error retrieving analytics: ${err}`,
		};
	}
}
