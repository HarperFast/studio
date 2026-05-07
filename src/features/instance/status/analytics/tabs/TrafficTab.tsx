import { ConnectionsPanel } from './ConnectionsPanel.tsx';
import { MetricPanel } from './MetricPanel.tsx';

// Connections is rendered by a custom panel because it merges two source
// metrics (mqtt-connections + ws-connections) — the generic MetricPanel
// is single-metric. The remaining traffic panels go through MetricPanel
// in the order below.
const METRICS = [
	'mqtt-traffic-sent',
	'mqtt-traffic-received',
	'bytes-sent',
	'bytes-received',
	'tls-reused',
	'connection',
] as const;

export function TrafficTab() {
	return (
		<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
			<ConnectionsPanel />
			{METRICS.map((m) => <MetricPanel key={m} metric={m} />)}
		</div>
	);
}
