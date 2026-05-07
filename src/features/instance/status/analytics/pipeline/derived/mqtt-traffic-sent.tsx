import { TrafficByTypeRenderer } from '../../primitives/TrafficByTypeRenderer.tsx';
import type { DerivedMetricSpec, MetricSpec } from '../../types/analytics.ts';
import { runPipeline } from '../pipeline.ts';

// Inner spec defaults to per-type stacking. Renderer remaps dimension
// to 'node' in per-node viewMode so the operator sees cluster total
// stacked by node — same pattern bytes-sent / connections use.
const baseSpec: MetricSpec = {
	title: 'Messages sent by type (inner)',
	description:
		'Outbound message rate — cluster total across nodes. Internal spec used by mqtt-traffic-sent.recompute; not registered.',
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

export const mqttTrafficSentDerived: DerivedMetricSpec = {
	id: 'mqtt-traffic-sent',
	title: 'Messages sent by type',
	subtitle: 'Outbound message rate. Type chips solo / Ctrl-toggle; viewMode flips type/node stack.',
	tab: 'traffic',
	sourceMetric: 'bytes-sent',
	recompute: (records, window, nodes, viewMode) => {
		// Retained for backward compatibility / direct callers; the
		// Renderer below is what the dashboard actually uses.
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
