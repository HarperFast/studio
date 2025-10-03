import { MetricVisualization } from '@/features/instance/status/components/monitoring/MetricVisualization.tsx';
import { useMemo, useState } from 'react';
import { InstanceClientConfig } from '@/config/instanceClientConfig.ts';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { useInterval } from '@/hooks/useInterval.ts';
import { MetricConfig } from '@/features/instance/operations/queries/getAnalytics.ts';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';

const metrics: MetricConfig[] = [
	{id: 'db-read', name: 'db-read', unit: ' reads'},
	{id: 'cpu-usage-user', name: 'cpu-usage', path: 'user', unit: ' s'},
];

const windowOptions: {label: string, value: number}[] = [
	{label: '10 mins', value: 10 * 60_000},
	{label: 'hour', value: 60 * 60_000},
	{label: '6 hours', value: 6 * 60 * 60_000},
	{label: 'day', value: 24 * 60 * 60_000},
];

export function Monitoring({instanceClient}: InstanceClientConfig) {
	const [selectedMetric, setSelectedMetric] = useState(metrics[0]);

	const [updateInterval, setUpdateInterval] = useState(60_000); // default to update every 60 secs
	const [endTime, setEndTime] = useState(Date.now);

	const [timeWindow, setTimeWindow] = useState(windowOptions[1]); // default to show last hour

	useInterval(() => { setEndTime(Date.now); }, updateInterval);

	const startTime = useMemo(() => endTime - timeWindow.value, [endTime, timeWindow]);

	const [updateIntervalInputValue, setUpdateIntervalInputValue] = useState(updateInterval / 1000);

	return (
		<div>
			<div className="flex justify-between">
				<h1 className="pb-6 text-3xl">Status</h1>
				<div>
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
									let itemLabel = m.name;
									if (m.path) {
										itemLabel += ` (${m.path})`;
									}
									return <SelectItem key={m.id} value={m.id}>{itemLabel}</SelectItem>;
								})}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Label className="ml-8 mr-2">Show last</Label>
					<Select
						defaultValue={timeWindow.value.toString()}
						onValueChange={(value) => {
							setTimeWindow(windowOptions.find((w) => w.value === Number(value))!);
						}}>
						<SelectTrigger className="inline-flex align-middle w-auto h-auto">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{windowOptions.map((w) => {
									return <SelectItem key={w.value} value={w.value.toString()}>{w.label}</SelectItem>
								})}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Label className="ml-8 mr-2">Update every</Label>
					<Input
						className="mr-2 w-16 inline-block"
					  id="updateIntervalInput"
					  type="number"
					  onChange={(e) => setUpdateIntervalInputValue(Number(e.target.value))}
					  onBlur={(e) => setUpdateInterval(Number(e.target.value) * 1000)}
					  value={updateIntervalInputValue}
					/>
					seconds
				</div>
			</div>
			<MetricVisualization
			  metricConfig={selectedMetric}
			  metricDataKey="count"
				startTime={startTime}
				endTime={endTime}
				instanceClient={instanceClient} />
		</div>
	)
}
