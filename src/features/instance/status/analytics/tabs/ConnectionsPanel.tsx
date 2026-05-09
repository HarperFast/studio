import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo, useRef } from 'react';
import { ChartCopyButton } from '../components/ChartCopyButton.tsx';
import { ChartExpandButton } from '../components/ChartExpandButton.tsx';
import { ChartExportButton } from '../components/ChartExportButton.tsx';
import { useAnalyticsContext } from '../context/AnalyticsContext.tsx';
import { useAnalyticsRecords } from '../hooks/useAnalyticsRecords.ts';
import { ConnectionsRenderer } from '../pipeline/connections.tsx';
import type { AnalyticsDataPoint } from '../types/analytics.ts';
import { PanelErrorBoundary } from './PanelErrorBoundary.tsx';

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
	const { timeRange, bucketMs, refreshIntervalMs, theme, instanceParams } = useAnalyticsContext();
	// Chart-only ref; capturing the whole Card would include the action buttons
	// in the exported PNG.
	const chartRef = useRef<HTMLDivElement>(null);

	const mqtt = useAnalyticsRecords({
		metric: 'mqtt-connections',
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		refetchIntervalMs: refreshIntervalMs,
		bucketMs,
	});
	const ws = useAnalyticsRecords({
		metric: 'ws-connections',
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		refetchIntervalMs: refreshIntervalMs,
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
	const nodes = useMemo(() => {
		const set = new Set<string>();
		for (const r of merged) {
			if (typeof r.node === 'string') { set.add(r.node); }
		}
		return [...set].sort();
	}, [merged]);

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

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<CardTitle>Connections</CardTitle>
					<CardDescription>Active MQTT + WebSocket sessions — chips solo / Ctrl-toggle.</CardDescription>
				</div>
				{canExport && (
					<div className="flex items-center gap-1 shrink-0">
						<ChartExpandButton
							exportSlug="connections"
							title="Connections"
							description="Active MQTT + WebSocket sessions."
							renderChart={renderChart}
						/>
						<ChartCopyButton captureRef={chartRef} exportSlug="connections" />
						<ChartExportButton captureRef={chartRef} exportSlug="connections" />
					</div>
				)}
			</CardHeader>
			<CardContent>
				<div ref={chartRef}>
					{isLoading
						? <div className="h-64 rounded-md bg-muted/30 animate-pulse" aria-label="Loading" />
						: isError
						? (
							<div className="h-64 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
								{`Failed to load: ${error?.message ?? 'unknown error'}`}
							</div>
						)
						: isEmpty
						? (
							<div className="h-64 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center">
								No active sessions in the selected time range.
							</div>
						)
						: renderChart()}
				</div>
			</CardContent>
		</Card>
	);
}
