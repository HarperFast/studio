import { MetricPanel } from './MetricPanel.tsx';

const METRICS = [
	'request-rate',
	'error-rate',
	'duration',
	'success',
	'transfer',
	'response_200',
	'cache-hit',
	'cache-resolution',
] as const;

export function RequestsTab() {
	return (
		<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
			{METRICS.map((m) => <MetricPanel key={m} metric={m} />)}
		</div>
	);
}
