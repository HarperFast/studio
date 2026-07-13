import { MetricPanel } from './MetricPanel';

export function ReplicationTab() {
	return (
		<div className="grid grid-cols-1 gap-4">
			<MetricPanel metric="replication-latency" />
		</div>
	);
}
