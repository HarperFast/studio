import { useQuery } from '@tanstack/react-query';
import { getAnalyticsQueryOptions, type MetricConfig, type Metric, type MetricDataKey, type MetricUnits } from '@/features/instance/operations/queries/getAnalytics.ts';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { useMemo, useState } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { scaleValueToUnits, determineUnits } from '@/lib/units';
import { harperPalette } from '@/lib/colorPalette.ts';

type MetricValue = string | number | boolean;
type NullableMetricValue = MetricValue | null;
type NullableMetric = {[key: string]: NullableMetricValue};
type NodeMetric = {[node: string]: number};
type CoalescedMetrics = {[id: string]: NodeMetric};
type FormattedMetric = {[node: string]: string};

interface MetricVisualizationParams {
	metricConfig: MetricConfig;
	startTime: number;
	endTime: number;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

function resolveMetricDataKey(metric: Metric, dataKey: MetricDataKey, baseUnits: MetricUnits, conversionUnits?: string) {
	let baseValue;
	if (typeof dataKey === 'string') {
		baseValue = metric[dataKey] as number ?? 0;
	} else {
		baseValue = dataKey(metric);
	}

	if (conversionUnits) {
		return scaleValueToUnits(baseValue, baseUnits, conversionUnits);
	}

	return baseValue;
}

export function MetricVisualization({ metricConfig, startTime, endTime, instanceParams }: MetricVisualizationParams) {
	const { data } = useQuery(getAnalyticsQueryOptions({instanceParams, metricConfig, startTime, endTime}));
	const metrics = useMemo(() => {
		return data?.reduce((ms: Metric[], m: NullableMetric) => {
			const newMetric: Metric = {metric: '', node: '', id: 0, period: 0, count: 0, mean: 0};
			for (const k in m) {
				if (m[k] !== null) {
					newMetric[k] = m[k];
				}
			}
			ms.push(newMetric);
			return ms;
		}, [])
	}, [data]);

	const [yAxisUnits, setYAxisUnits] = useState<string>(metricConfig.units);

	const nodeMetrics = useMemo(() => {
		const coalescedMetrics: CoalescedMetrics = {};
		const { dataKey, aggregator, units } = metricConfig;
		let conversionUnits = units as string;

		if (metrics && metrics.length > 0) {
			const maxDataValue = Math.max(...metrics.map((m) => resolveMetricDataKey(m, dataKey, units)));
			conversionUnits = determineUnits(units, maxDataValue);
			// We set the y-axis based on the max of the metrics, and we were careful to avoid a circular dependency.
			// So ignoring the set-state-in-render is safe, in this case.
			// eslint-disable-next-line react-hooks/set-state-in-render
			setYAxisUnits(conversionUnits);

			for (const metric of metrics) {
				const coalescedTime = Math.floor(metric.id / metric.period) * metric.period;
				const resolvedMetric = resolveMetricDataKey(metric, dataKey, units, conversionUnits);

				if (coalescedMetrics[coalescedTime]) {
					if (metric.node in coalescedMetrics[coalescedTime]) {
						coalescedMetrics[coalescedTime][metric.node] = aggregator(coalescedMetrics[coalescedTime][metric.node], resolvedMetric);
					} else {
						coalescedMetrics[coalescedTime][metric.node] = resolvedMetric;
					}
				} else {
					coalescedMetrics[coalescedTime] = { [metric.node]: resolvedMetric };
				}
			}

			return Object.keys(coalescedMetrics).map((id: string) => {
				const numericalId = Number.parseInt(id);
				const coalescedMetric = coalescedMetrics[id];
				const formattedMetrics = Object.keys(coalescedMetrics[id]).reduce((metric, node) => {
					metric[node] = coalescedMetric[node].toFixed(2);
					return metric;
				}, {} as FormattedMetric);
				return { id: numericalId, ...formattedMetrics };
			});
		}
	}, [metrics, metricConfig]);

	const nodes = useMemo(() => {
		return Array.from(new Set<string>(metrics?.map((m) => m.node)));
	}, [metrics]);

	const formatTime = (ts: number) => {
		const date = new Date(ts);
		return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
	}

	if (nodeMetrics && nodeMetrics.length > 0) {
		return (
			<ResponsiveContainer width="100%" height={600} className="mt-8">
				<LineChart width={600} height={300} data={nodeMetrics}>
					{nodes.map((node, i) => {
						let metricDifferentiator = metricConfig.name;
						if (metricConfig.path) {
							metricDifferentiator += '.' + metricConfig.path;
						}
						const key = metricDifferentiator + '.' + node;
						return <Line key={key} name={node} dataKey={node} stroke={Object.values(harperPalette)[i]} />
					})
					}
					<XAxis dataKey={(item) => formatTime(item.id)} />
					<YAxis unit={` ${yAxisUnits}`} width={100} />
					<Legend />
					<Tooltip />
				</LineChart>
			</ResponsiveContainer>
		)
	}

	return (
		<div className="mt-8">
			<p>No {metricConfig.name} data for this time period</p>
		</div>
	);
}
