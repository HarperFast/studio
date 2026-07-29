import { TrafficByTypeRenderer } from '../../primitives/TrafficByTypeRenderer';
import type { DerivedMetricSpec, MetricSpec } from '../../types/analytics';
import { runPipeline } from '../pipeline';

interface MqttTrafficConfig {
	id: string;
	title: string;
	subtitle: string;
	sourceMetric: string;
	/** Title/description on the internal (unregistered) pipeline spec. */
	innerTitle: string;
	innerDescription: string;
}

/** The sent/received pair differ only in strings — one factory builds both.
 *
 *  Inner spec defaults to per-type stacking. Renderer remaps dimension
 *  to 'node' in per-node viewMode so the operator sees cluster total
 *  stacked by node — same pattern bytes-sent / connections use. */
function makeMqttTrafficDerived(
	{ id, title, subtitle, sourceMetric, innerTitle, innerDescription }: MqttTrafficConfig,
): DerivedMetricSpec {
	const baseSpec: MetricSpec = {
		title: innerTitle,
		description: innerDescription,
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

	return {
		id,
		title,
		subtitle,
		tab: 'traffic',
		sourceMetric,
		recompute: (records, window, nodes, viewMode) => {
			// Retained for backward compatibility / direct callers; the
			// Renderer below is what the dashboard actually uses.
			const isPerNode = (viewMode ?? 'per-node') === 'per-node';
			let spec: MetricSpec = baseSpec;
			if (isPerNode && baseSpec.series.kind === 'groupBy') {
				spec = { ...baseSpec, series: { ...baseSpec.series, dimension: 'node' } };
			}
			return runPipeline(spec, records, window, nodes, { snapToPeriod: true, downsampleToWindow: true });
		},
		Renderer: (props) => <TrafficByTypeRenderer spec={baseSpec} typeField="type" {...props} />,
		primitive: 'stacked-area',
		yAxis: { unit: ' msg/s', formatter: 'count-si' },
	};
}

export const mqttTrafficSentDerived = makeMqttTrafficDerived({
	id: 'mqtt-traffic-sent',
	title: 'Messages sent by type',
	subtitle: 'Outbound message rate. Type chips solo / Ctrl-toggle; viewMode flips type/node stack.',
	sourceMetric: 'bytes-sent',
	innerTitle: 'Messages sent by type (inner)',
	innerDescription:
		'Outbound message rate — cluster total across nodes. Internal spec used by mqtt-traffic-sent.recompute; not registered.',
});

export const mqttTrafficReceivedDerived = makeMqttTrafficDerived({
	id: 'mqtt-traffic-received',
	title: 'Messages received by type',
	subtitle: 'Inbound message rate. Type chips solo / Ctrl-toggle; viewMode flips type/node stack.',
	sourceMetric: 'bytes-received',
	innerTitle: 'Messages received by type (inner)',
	innerDescription:
		'Inbound message rate — cluster total across nodes. Internal spec used by mqtt-traffic-received.recompute; not registered.',
});
