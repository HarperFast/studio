export async function listAnalyticsMetrics({
	metricTypes,
	customWindowMS,
	instanceParams,
}: any) {
	const { data } = await instanceParams.instanceClient.post('/', {
		operation: 'list_analytics_metrics',
		metricTypes,
		customWindowMS,
	});
	return data;
}
