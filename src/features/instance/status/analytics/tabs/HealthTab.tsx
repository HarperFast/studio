import { MetricPanel } from './MetricPanel';

const METRICS = [
	'resource-usage',
	'memory',
	'main-thread-utilization',
	'cpu-usage',
	'utilization',
] as const;

export function HealthTab() {
	return (
		<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
			{METRICS.map((m) => <MetricPanel key={m} metric={m} />)}
		</div>
	);
}
