import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type ReactNode, useRef } from 'react';
import { ChartCopyButton } from '../components/ChartCopyButton.tsx';
import { ChartExpandButton } from '../components/ChartExpandButton.tsx';
import { ChartExportButton } from '../components/ChartExportButton.tsx';
import { useAnalyticsContext } from '../context/AnalyticsContext.tsx';
import { useAnalyticsRecords } from '../hooks/useAnalyticsRecords.ts';
import { getSpecRequiredFields } from '../lib/specRequiredFields.ts';
import { derivedRegistry } from '../pipeline/derived/index.ts';
import { specRegistry } from '../pipeline/index.ts';
import { MetricRenderer } from '../primitives/MetricRenderer.tsx';
import { PanelErrorBoundary } from './PanelErrorBoundary.tsx';

interface Props {
	metric: string;
	titleOverride?: string;
}

/** Renders one Card with a metric chart inside, fetching its own data via
 *  the adapter. Used by every analytics tab except Storage's table-size
 *  panels (which compose their own custom charts). */
export function MetricPanel({ metric, titleOverride }: Props) {
	return (
		<PanelErrorBoundary metric={metric}>
			<MetricPanelInner metric={metric} titleOverride={titleOverride} />
		</PanelErrorBoundary>
	);
}

function MetricPanelInner({ metric, titleOverride }: Props) {
	const { timeRange, bucketMs, refreshIntervalMs, theme, instanceParams } = useAnalyticsContext();
	const sourceMetric = derivedRegistry[metric]?.sourceMetric ?? metric;
	const requiredFields = getSpecRequiredFields(metric);
	const { data, isLoading, isError, error, isEmpty, missingFields, refetch } = useAnalyticsRecords({
		metric: sourceMetric,
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		refetchIntervalMs: refreshIntervalMs,
		bucketMs,
		requiredFields,
	});

	const specEntry = specRegistry[metric];
	const derivedEntry = derivedRegistry[metric];
	const title = titleOverride ?? specEntry?.spec?.title ?? derivedEntry?.title ?? metric;
	const description = specEntry?.spec?.description ?? derivedEntry?.subtitle;
	const nodes = collectNodes(data);
	// Capture only the chart body, not the whole Card. Otherwise the exported
	// PNG includes the title bar's Expand/Copy/Download icons.
	const chartRef = useRef<HTMLDivElement>(null);
	const canExport = !isLoading && !isError && !isEmpty;

	const renderChart = (opts: { fillParent: boolean } = { fillParent: false }) => (
		<MetricRenderer
			metric={metric}
			records={data}
			window={timeRange}
			nodes={nodes}
			theme={theme}
			fillParent={opts.fillParent}
		/>
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</div>
				{canExport && (
					<div className="flex items-center gap-1 shrink-0">
						<ChartExpandButton
							exportSlug={metric}
							title={title}
							description={description}
							renderChart={renderChart}
						/>
						<ChartCopyButton captureRef={chartRef} exportSlug={metric} />
						<ChartExportButton captureRef={chartRef} exportSlug={metric} />
					</div>
				)}
			</CardHeader>
			<CardContent>
				<div ref={chartRef}>
					<PanelStateOrChart
						isLoading={isLoading}
						isError={isError}
						error={error}
						isEmpty={isEmpty}
						missingFields={missingFields}
						onRetry={refetch}
					>
						{renderChart()}
					</PanelStateOrChart>
				</div>
			</CardContent>
		</Card>
	);
}

function PanelStateOrChart({
	isLoading,
	isError,
	error,
	isEmpty,
	missingFields,
	onRetry,
	children,
}: {
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	isEmpty: boolean;
	missingFields: string[];
	onRetry: () => void;
	children: ReactNode;
}) {
	if (isLoading) {
		return <div className="h-64 rounded-md bg-muted/30 animate-pulse" aria-label="Loading" />;
	}
	if (isError) {
		return (
			<div className="h-64 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex flex-col items-start justify-center gap-3">
				<div>{`Failed to load: ${error?.message ?? 'unknown error'}`}</div>
				<Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
			</div>
		);
	}
	if (isEmpty) {
		return (
			<div className="h-64 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center">
				{missingFields.length > 0
					? `No data — server response is missing required field(s): ${missingFields.join(', ')}.`
					: 'No data in the selected time range.'}
			</div>
		);
	}
	return <>{children}</>;
}

function collectNodes(rows: { node?: unknown }[]): string[] {
	const set = new Set<string>();
	for (const r of rows) {
		if (typeof r.node === 'string') { set.add(r.node); }
	}
	return [...set].sort();
}
