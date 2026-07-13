import { useMemo } from 'react';
import { useAnalyticsContext } from '../context/AnalyticsContext.tsx';
import { useAnalyticsRecords } from '../hooks/useAnalyticsRecords.ts';
import { ConnectionsRenderer } from '../pipeline/connections.tsx';
import type { AnalyticsDataPoint } from '../types/analytics.ts';
import { PanelErrorBoundary } from './PanelErrorBoundary.tsx';
import { collectNodes, PanelCard, PanelStateOrChart } from './PanelShell.tsx';

/** Some Harper builds split active-session telemetry across two metrics:
 *  `mqtt-connections` (active MQTT sessions) and `ws-connections` (active
 *  WebSocket sessions). Each row carries a `connections` field but no
 *  protocol discriminator — the metric NAME is the discriminator. We
 *  fetch both, tag each row with a synthesized `type` so the renderer's
 *  groupBy('type') has something to key on, and pass the merged stream
 *  into the standard ConnectionsRenderer.
 *
 *  This mirrors analytics-viz's PanelConnections approach (DashboardPanel
 *  multi-source merge). It's why this panel doesn't go through the
 *  generic MetricPanel — that path is single-metric-per-card. */
export function ConnectionsPanel() {
	const { timeRange } = useAnalyticsContext();
	return (
		<PanelErrorBoundary metric="connections" resetKey={`${timeRange.startTime}-${timeRange.endTime}`}>
			<ConnectionsPanelInner />
		</PanelErrorBoundary>
	);
}

function ConnectionsPanelInner() {
	const { timeRange, bucketMs, theme, instanceParams } = useAnalyticsContext();

	const mqtt = useAnalyticsRecords({
		metric: 'mqtt-connections',
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
	});
	const ws = useAnalyticsRecords({
		metric: 'ws-connections',
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
	});

	const isLoading = mqtt.isLoading || ws.isLoading;
	const isError = mqtt.isError || ws.isError;
	const error = mqtt.error || ws.error;

	const merged = useMemo<AnalyticsDataPoint[]>(() => {
		const out: AnalyticsDataPoint[] = [];
		for (const r of mqtt.data) { out.push({ ...r, type: 'mqtt' }); }
		for (const r of ws.data) { out.push({ ...r, type: 'ws' }); }
		return out;
	}, [mqtt.data, ws.data]);

	const isEmpty = merged.length === 0;
	const nodes = useMemo(() => collectNodes(merged), [merged]);

	const canExport = !isLoading && !isError && !isEmpty;
	const renderChart = (opts: { fillParent: boolean } = { fillParent: false }) => (
		<ConnectionsRenderer
			records={merged}
			timeRange={timeRange}
			nodes={nodes}
			theme={theme}
			fillParent={opts.fillParent}
		/>
	);

	const retryBoth = () => {
		mqtt.refetch();
		ws.refetch();
	};

	return (
		<PanelCard
			title="Connections"
			description="Active MQTT + WebSocket sessions — chips solo / Ctrl-toggle."
			expandDescription="Active MQTT + WebSocket sessions."
			exportSlug="connections"
			canExport={canExport}
			renderChart={renderChart}
		>
			<PanelStateOrChart
				isLoading={isLoading}
				isError={isError}
				error={error}
				isEmpty={isEmpty}
				emptyMessage="No active sessions in the selected time range."
				onRetry={retryBoth}
			>
				{renderChart()}
			</PanelStateOrChart>
		</PanelCard>
	);
}
