import { MetricVisualization } from '@/features/instance/status/components/monitoring/MetricVisualization.tsx';
import { useMemo, useState } from 'react';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { Label } from '@/components/ui/label.tsx';
import { useInterval } from '@/hooks/useInterval.ts';
import { getAnalyticsQueryOptions, Metric, MetricConfig } from '@/features/instance/operations/queries/getAnalytics.ts';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { LoadingSubtle } from '@/components/LoadingSubtle.tsx';
import { useQuery } from '@tanstack/react-query';

const metrics: MetricConfig[] = [
	{
		id: 'db-read',
		name: 'db-read',
		dataKey: 'count',
		aggregator: aggregateSum,
		units: 'reads'
	},
	{
		id: 'db-read-bytes',
		label: 'db-read-bytes',
		name: 'db-read',
		dataKey: metricSum,
		aggregator: aggregateSum,
		units: 'bytes',
	},
	{
		id: 'db-write',
		name: 'db-write',
		dataKey: 'count',
		aggregator: aggregateSum,
		units: 'writes',
	},
	{
		id: 'db-write-bytes',
		label: 'db-write-bytes',
		name: 'db-write',
		dataKey: metricSum,
		aggregator: aggregateSum,
		units: 'bytes',
	},
	{
		id: 'db-message',
		name: 'db-message',
		dataKey: 'count',
		aggregator: aggregateSum,
		units: 'messages',
	},
	{
		id: 'db-message-bytes',
		label: 'db-message-bytes',
		name: 'db-message',
		dataKey: metricSum,
		aggregator: aggregateSum,
		units: 'bytes',
	},
	{
		id: 'cpu-usage-user',
		name: 'cpu-usage',
		path: 'user',
		dataKey: metricSum,
		aggregator: aggregateSum,
		units: 'secs',
	},
	{
		id: 'cpu-usage-harper',
		name: 'cpu-usage',
		path: 'harper',
		dataKey: metricSum,
		aggregator: aggregateSum,
		units: 'secs',
	},
];

function metricSum(metric: Metric) {
	if (metric.mean && metric.count) {
		return metric.mean * metric.count;
	}
	return 0;
}

function aggregateSum(accumulator: number, current: number) {
	return accumulator + current;
}

interface TimeSelectOption {
	label: string;
	value: number;
	default?: boolean;
}
type TimeSelectOptions = TimeSelectOption[];

const windowOptions: TimeSelectOptions = [
	{label: '10 mins', value: 10 * 60_000},
	{label: 'hour', value: 60 * 60_000, default: true},
	{label: '6 hours', value: 6 * 60 * 60_000},
	{label: 'day', value: 24 * 60 * 60_000},
];

const intervalOptions: TimeSelectOptions = [
	{label: '5 secs', value: 5_000},
	{label: '15 secs', value: 15_000},
	{label: '30 secs', value: 30_000},
	{label: 'minute', value: 60_000, default: true},
	{label: '5 mins',  value: 5 * 60_000},
	{label: '15 mins',  value: 15 * 60_000},
];

interface MonitoringParams {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

export function Monitoring({instanceParams}: MonitoringParams) {
	const [selectedMetric, setSelectedMetric] = useState(metrics[0]);

	const [updateInterval, setUpdateInterval] = useState(intervalOptions.find((o) => o.default)!);
	const [endTime, setEndTime] = useState(Date.now);

	const [timeWindow, setTimeWindow] = useState(windowOptions.find((o) => o.default)!);

	useInterval(() => { setEndTime(Date.now); }, updateInterval.value);

	const startTime = useMemo(() => endTime - timeWindow.value, [endTime, timeWindow]);

	const { data, isLoading } = useQuery(getAnalyticsQueryOptions({instanceParams, metricConfig: selectedMetric, startTime, endTime}));

	return (
		<div>
			<div className="flex justify-between">
				<div className="justify-items-end grid grid-cols-1 lg:grid-cols-3 gap-4">
					<div className="flex flex-nowrap items-center">
						<Label className="ml-8 mr-2">Metric:</Label>
						<Select
							defaultValue={selectedMetric.id}
							onValueChange={(value) => {
								setSelectedMetric(metrics.find((m) => m.id === value) || metrics[0]);
							}}>
							<SelectTrigger className="inline-flex align-middle w-auto h-auto">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{metrics.map((m) => {
										let itemLabel = m.label ?? m.name;
										if (m.path) {
											itemLabel += ` (${m.path})`;
										}
										return <SelectItem key={m.id} value={m.id}>{itemLabel}</SelectItem>;
									})}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-nowrap items-center">
						<Label className="ml-8 mr-2">Show last</Label>
						<Select
							defaultValue={timeWindow.value.toString()}
							onValueChange={(value) => {
								setTimeWindow(windowOptions.find((o) => o.value === Number(value))!);
							}}>
							<SelectTrigger className="inline-flex align-middle w-auto h-auto">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{windowOptions.map((o) => {
										return <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
									})}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-nowrap items-center">
						<Label className="ml-8 mr-2">Update every</Label>
						<Select
							defaultValue={updateInterval.value.toString()}
							onValueChange={(value) => {
								setUpdateInterval(intervalOptions.find((o) => o.value === Number(value))!);
							}}>
							<SelectTrigger className="inline-flex align-middle w-auto h-auto">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{intervalOptions.map((o) => {
										return <SelectItem key={o.value} value={o.value.toString()}>{o.label}</SelectItem>
									})}
								</SelectGroup>
							</SelectContent>
						</Select>
						{isLoading && (<LoadingSubtle/>)}
					</div>
				</div>
			</div>
			<MetricVisualization metricConfig={selectedMetric} data={data} />
		</div>
	)
}
