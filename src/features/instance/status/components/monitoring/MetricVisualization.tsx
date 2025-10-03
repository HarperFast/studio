import { useQuery } from '@tanstack/react-query';
import { getAnalyticsQueryOptions, MetricConfig } from '@/features/instance/operations/queries/getAnalytics.ts';
import { InstanceClientConfig } from '@/config/instanceClientConfig.ts';
import { useMemo } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type MetricValue = string | number | boolean;
type NullableMetricValue = MetricValue | null;
type Metric = {node: string, id: number, period: number, [key: string]: MetricValue};
type NullableMetric = {[key: string]: NullableMetricValue};
type CoalescedMetrics = {[id: string]: {[node: string]: MetricValue}};

interface MetricVisualizationParams extends InstanceClientConfig {
	metricConfig: MetricConfig;
	metricDataKey: keyof Metric;
	startTime: number;
	endTime: number;
}

const harperPalette = {
	'persistence-purple': '#403B8A',
	'b-tree-green': '#55C58F',
	'cyber-grape': '#7A3A87',
	'quantum-purple': '#312556',
	'cloud-white': '#F5F5F5',
	'acid-magenta': '#C63368',
	'edge-gray': '#383D40',
};

export function MetricVisualization({ metricConfig, metricDataKey, startTime, endTime, instanceClient }: MetricVisualizationParams) {
	const { data } = useQuery(getAnalyticsQueryOptions({instanceClient, metricConfig, startTime, endTime}));
	const metrics: Metric[] = useMemo(() => {
		return data?.reduce((ms: Metric[], m: NullableMetric) => {
			const newMetric: Metric = {node: '', id: 0, period: 0};
			for (const k in m) {
				if (m[k] !== null) {
					newMetric[k] = m[k];
				}
			}
			ms.push(newMetric);
			return ms;
		}, [])
	}, [data]);

	const nodeMetrics = useMemo(() => {
		const coalescedMetrics: CoalescedMetrics = {};

		if (metrics) {
			for (const metric of metrics) {
				const coalescedTime = Math.floor(metric.id / metric.period) * metric.period;
				if (coalescedMetrics[coalescedTime]) {
					coalescedMetrics[coalescedTime][metric.node] = metric[metricDataKey];
				} else {
					coalescedMetrics[coalescedTime] = { [metric.node]: metric[metricDataKey] };
				}
			}

			return Object.keys(coalescedMetrics).map((id: string) => {
				return { id: Number.parseInt(id), ...coalescedMetrics[id] };
			});
		}
	}, [metrics, metricDataKey]);

	const nodes = useMemo(() => {
		return Array.from(new Set<string>(metrics?.map((m) => m.node)));
	}, [metrics]);

	const formatTime = (ts: number) => {
		const date = new Date(ts);
		return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
	}

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
				<YAxis unit={metricConfig.unit} width={80} />
				<Legend />
				<Tooltip />
			</LineChart>
		</ResponsiveContainer>
	)
}
