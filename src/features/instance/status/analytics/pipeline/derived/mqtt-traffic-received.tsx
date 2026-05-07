import { TrafficByTypeRenderer } from '../../primitives/TrafficByTypeRenderer.tsx';
import type { DerivedMetricSpec, MetricSpec } from '../../types/analytics.ts';
import { runPipeline } from '../pipeline.ts';

// Inner spec defaults to per-type stacking. Renderer remaps dimension
// to 'node' in per-node viewMode so the operator sees cluster total
// stacked by node — same pattern bytes-received / connections use.
const baseSpec: MetricSpec = {
	title: 'Messages received by type (inner)',
	description:
		'Inbound message rate — cluster total across nodes. Internal spec used by mqtt-traffic-received.recompute; not registered.',
	tab: 'traffic',
	primaryDimension: 'node',
	subDimension: 'type',
	series: {
		kind: 'groupBy',
		dimension: 'type',
		field: {
			field: 'count',
			label: 'messages/sec',
			transform: { kind: 'rate' },
		},
	},
	timestamp: 'time',
	bucket: { source: 'period-field', fallbackMs: 60000 },
	aggregator: { temporal: 'sum', crossNode: 'sum' },
	primitive: 'stacked-area',
	yAxis: { unit: ' msg/s', formatter: 'count-si' },
};

export const mqttTrafficReceivedDerived: DerivedMetricSpec = {
	id: 'mqtt-traffic-received',
	title: 'Messages received by type',
	subtitle: 'Inbound message rate. Type chips solo / Ctrl-toggle; viewMode flips type/node stack.',
	tab: 'traffic',
	sourceMetric: 'bytes-received',
	recompute: (records, window, nodes, viewMode) => {
		const isPerNode = (viewMode ?? 'per-node') === 'per-node';
		let spec: MetricSpec = baseSpec;
		if (isPerNode && baseSpec.series.kind === 'groupBy') {
			spec = { ...baseSpec, series: { ...baseSpec.series, dimension: 'node' } };
		}
		return runPipeline(spec, records, window, nodes, { snapToPeriod: true });
	},
	Renderer: (props) => <TrafficByTypeRenderer spec={baseSpec} typeField="type" {...props} />,
	primitive: 'stacked-area',
	yAxis: { unit: ' msg/s', formatter: 'count-si' },
};
