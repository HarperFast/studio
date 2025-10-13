import { useQuery } from '@tanstack/react-query';
import { getAnalyticsQueryOptions, type MetricConfig, type Metric, type MetricDataKey, type Units } from '@/features/instance/operations/queries/getAnalytics.ts';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { useMemo, useState } from 'react';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { harperPalette } from '@/lib/colorPalette.ts';

type MetricValue = string | number | boolean;
type NullableMetricValue = MetricValue | null;
type NullableMetric = {[key: string]: NullableMetricValue};
type CoalescedMetrics = {[id: string]: {[node: string]: MetricValue}};

interface MetricVisualizationParams {
	metricConfig: MetricConfig;
	startTime: number;
	endTime: number;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

const byteUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
const timeUnits = ['secs', 'mins', 'hrs'];

function convertToUnits(value: number, baseUnits: Units, units: string) {
	let availableUnits;
	let conversionBase;
	switch (baseUnits) {
		case 'bytes': {
			availableUnits = byteUnits;
			conversionBase = 1024;
			break;
		}
		case 'secs': {
			availableUnits = timeUnits;
			conversionBase = 60;
			break;
		}
		default:
			return value;
	}
	const converstionExponent = availableUnits.indexOf(units);
	const conversionFactor = conversionBase ** converstionExponent;
	const converted = (value / conversionFactor).toFixed(2);
	return Number(converted);
}

function determineUnits(baseUnits: Units, value: number) {
	let availableUnits;
	switch (baseUnits) {
		case 'bytes':
			availableUnits = byteUnits;
			break;
		case 'secs':
			availableUnits = timeUnits;
			break;
		default:
			return baseUnits;
	}
	let i = 0;
	while (value > 1024 && i < availableUnits.length - 1) {
		value /= 1024;
		i++;
	}
	return availableUnits[i];
}

function resolveMetricDataKey(metric: Metric, dataKey: MetricDataKey, baseUnits: Units, conversionUnits?: string) {
	let baseValue;
	if (typeof dataKey === 'string') {
		baseValue = metric[dataKey] as number ?? 0;
	} else {
		baseValue = dataKey(metric);
	}

	if (conversionUnits) {
		return convertToUnits(baseValue, baseUnits, conversionUnits);
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
		const { dataKey, units } = metricConfig;
		let conversionUnits = units as string;

		if (metrics && metrics.length > 0) {
			const maxDataValue = Math.max(...metrics.map((m) => resolveMetricDataKey(m, dataKey, units)));
			conversionUnits = determineUnits(units, maxDataValue);
			setYAxisUnits(conversionUnits);

			for (const metric of metrics) {
				const coalescedTime = Math.floor(metric.id / metric.period) * metric.period;
				const resolvedMetric = resolveMetricDataKey(metric, dataKey, units, conversionUnits);

				if (coalescedMetrics[coalescedTime]) {
					coalescedMetrics[coalescedTime][metric.node] = resolvedMetric;
				} else {
					coalescedMetrics[coalescedTime] = { [metric.node]: resolvedMetric };
				}
			}

			return Object.keys(coalescedMetrics).map((id: string) => {
				return { id: Number.parseInt(id), ...coalescedMetrics[id] };
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
					<YAxis unit={` ${yAxisUnits}`} width={80} />
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
