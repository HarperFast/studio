import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { errorText } from '@/lib/errorText';
import { type ReactNode, useRef } from 'react';
import { ChartCopyButton } from '../components/ChartCopyButton';
import { ChartCsvButton } from '../components/ChartCsvButton';
import { ChartExpandButton } from '../components/ChartExpandButton';
import { ChartExportButton } from '../components/ChartExportButton';
import type { ChartCsvData } from '../lib/csvExport';

interface PanelCardProps {
	title: string;
	/** Shown under the title in the card header. */
	description?: ReactNode;
	/** Description for the expanded dialog when it should differ from the
	 *  card header's (e.g. to drop hints that only apply inline). Defaults
	 *  to `description`. */
	expandDescription?: ReactNode;
	/** Slug used for export filenames and the action buttons' aria-labels. */
	exportSlug: string;
	/** Hide the expand/copy/download actions while there is nothing to capture. */
	canExport: boolean;
	/** Chart render function, forwarded to ChartExpandButton so the dialog
	 *  re-renders the chart at full size. */
	renderChart: (opts: { fillParent: boolean }) => ReactNode;
	/** Lazily produces the rendered data for the CSV download button. When
	 *  omitted the CSV button is not rendered (panel has no tabular data). */
	getCsvData?: () => ChartCsvData | null;
	children: ReactNode;
}

/** Shared analytics-panel chrome: a Card with title/description header, the
 *  expand/copy/download action row, and a capture ref wrapping the body so
 *  exports grab only the chart — not the header's action icons. Used by
 *  MetricPanel and ConnectionsPanel so the two can't drift. */
export function PanelCard({
	title,
	description,
	expandDescription = description,
	exportSlug,
	canExport,
	renderChart,
	getCsvData,
	children,
}: PanelCardProps) {
	// Capture only the chart body, not the whole Card. Otherwise the exported
	// PNG includes the title bar's Expand/Copy/Download icons.
	const chartRef = useRef<HTMLDivElement>(null);
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
							exportSlug={exportSlug}
							title={title}
							description={expandDescription}
							renderChart={renderChart}
							getCsvData={getCsvData}
						/>
						<ChartCopyButton captureRef={chartRef} exportSlug={exportSlug} />
						<ChartExportButton captureRef={chartRef} exportSlug={exportSlug} />
						{getCsvData && <ChartCsvButton exportSlug={exportSlug} getCsvData={getCsvData} />}
					</div>
				)}
			</CardHeader>
			<CardContent>
				<div ref={chartRef}>{children}</div>
			</CardContent>
		</Card>
	);
}

interface PanelStateOrChartProps {
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	isEmpty: boolean;
	/** Required Harper fields absent from the response — switches the empty
	 *  state to explicit schema-drift copy. */
	missingFields?: string[];
	/** Copy for the plain empty state (no missing fields). */
	emptyMessage?: string;
	onRetry: () => void;
	children: ReactNode;
}

/** The loading / error / empty ladder every analytics panel shares. Falls
 *  through to `children` (the chart) once data is ready. */
export function PanelStateOrChart({
	isLoading,
	isError,
	error,
	isEmpty,
	missingFields = [],
	emptyMessage = 'No data in the selected time range.',
	onRetry,
	children,
}: PanelStateOrChartProps) {
	if (isLoading) {
		return (
			<div
				role="status"
				aria-live="polite"
				className="h-64 rounded-md bg-muted/30 animate-pulse"
				aria-label="Loading"
			/>
		);
	}
	if (isError) {
		return (
			<div className="h-64 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex flex-col items-start justify-center gap-3">
				<div>{`Failed to load: ${errorText(error) ?? 'unknown error'}`}</div>
				<Button variant="defaultOutline" size="sm" onClick={onRetry}>Retry</Button>
			</div>
		);
	}
	if (isEmpty) {
		return (
			<div className="h-64 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center">
				{missingFields.length > 0
					? `No data — server response is missing required field(s): ${missingFields.join(', ')}.`
					: emptyMessage}
			</div>
		);
	}
	return <>{children}</>;
}

/** Distinct, sorted node names present in a record stream — feeds the
 *  renderers' node chips. */
export function collectNodes(rows: { node?: unknown }[]): string[] {
	const set = new Set<string>();
	for (const r of rows) {
		if (typeof r.node === 'string') { set.add(r.node); }
	}
	return [...set].sort();
}
