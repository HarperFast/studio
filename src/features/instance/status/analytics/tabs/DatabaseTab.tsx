import { MetricPanel } from './MetricPanel.tsx';

const METRICS = ['db-read', 'db-write', 'db-message'] as const;

export function DatabaseTab() {
	return (
		<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
			{METRICS.map((m) => <MetricPanel key={m} metric={m} />)}
		</div>
	);
}
