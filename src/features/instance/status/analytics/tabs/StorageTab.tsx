import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMemo, useRef, useState } from 'react';
import { TableSizeSnapshot } from '../charts/TableSizeSnapshot';
import { TableSizeTrend } from '../charts/TableSizeTrend';
import { ChartCopyButton } from '../components/ChartCopyButton';
import { ChartExpandButton } from '../components/ChartExpandButton';
import { ChartExportButton } from '../components/ChartExportButton';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { useAnalyticsRecords } from '../hooks/useAnalyticsRecords';
import { buildDerived, type RankBy, type TableSizeDerived } from '../lib/tableSize';
import type { TableSizeRecord } from '../types/analytics';
import { MetricPanel } from './MetricPanel';
import { PanelErrorBoundary } from './PanelErrorBoundary';

function derivedClusterNodes(derived: TableSizeDerived): string[] {
	return derived.snapshot.byNode.map((b) => b.node);
}

export function StorageTab() {
	return (
		<div className="grid grid-cols-1 gap-4">
			<PanelErrorBoundary metric="table-size">
				<TableSizePanels />
			</PanelErrorBoundary>
			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
				<MetricPanel metric="database-size" />
				<MetricPanel metric="transaction-log-growth" />
				<MetricPanel metric="storage-volume" />
			</div>
		</div>
	);
}

function TableSizePanels() {
	const { timeRange, bucketMs, instanceParams } = useAnalyticsContext();
	const { data, isLoading, isError } = useAnalyticsRecords({
		metric: 'table-size',
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
	});

	// Some Harper builds emit the bucket timestamp as `id`, others as `time`.
	// Accept either, but synthesize `id` from `time` so downstream
	// (buildDerived → tableSize.normalizeRecords) gets the contract it
	// expects. Drop rows that have neither — they'd feed NaN timestamps and
	// silently produce wrong snapshots.
	const raw = useMemo(() => {
		const rows = (data ?? []) as unknown as Array<TableSizeRecord & { time?: number }>;
		const cleaned: TableSizeRecord[] = [];
		let withoutTimestamp = 0;
		for (const r of rows) {
			if (typeof r.id === 'number') {
				cleaned.push(r);
			} else if (typeof r.time === 'number') {
				cleaned.push({ ...r, id: r.time });
			} else {
				withoutTimestamp++;
			}
		}
		if (withoutTimestamp > 0) {
			console.warn('[table-size] dropped rows missing both id and time', {
				dropped: withoutTimestamp,
				total: rows.length,
			});
		}
		return cleaned;
	}, [data]);
	const derived = useMemo(() => buildDerived(raw, timeRange), [raw, timeRange.startTime, timeRange.endTime]);

	// Backs TableSizeTrend's rank toggle — the trend chart renders bytes/%
	// buttons and reports clicks via onRankChange (previously wired to a
	// no-op, leaving dead toggle UI).
	const [rankBy, setRankBy] = useState<RankBy>('bytes');
	const [selected, setSelected] = useState<string | null>(null);
	const snapshotCardRef = useRef<HTMLDivElement>(null);
	const trendCardRef = useRef<HTMLDivElement>(null);
	const effectiveSelection = useMemo(() => {
		if (selected && derived.snapshot.tableSet.includes(selected)) { return selected; }
		return derived.defaultSelection(rankBy);
	}, [selected, derived, rankBy]);

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Table sizes</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="h-64 rounded-md bg-muted/30 animate-pulse" aria-label="Loading" />
				</CardContent>
			</Card>
		);
	}

	if (isError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Table sizes</CardTitle>
					<CardDescription>Per-table storage breakdown.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-32 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-center">
						Failed to load table-size data. Try a different time window or refresh.
					</div>
				</CardContent>
			</Card>
		);
	}

	if (derived.emptyCause === 'upstream-empty') {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Table sizes</CardTitle>
					<CardDescription>Per-table storage breakdown.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-32 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center">
						No table-size data in the selected window.
					</div>
				</CardContent>
			</Card>
		);
	}

	// renderSnapshot/renderTrend accept the opts shape ChartExpandButton passes,
	// but TableSizeSnapshot/Trend don't yet support fillParent — they render at
	// their native size in both inline and dialog views. Wiring fillParent into
	// those charts is a follow-up.
	const renderSnapshot = (_opts?: { fillParent: boolean }) => (
		<TableSizeSnapshot
			snapshot={derived.snapshot}
			viewMode="per-node"
			selectedTable={effectiveSelection}
			onChipSelect={setSelected}
			onBarClick={setSelected}
			allOtherHint={derived.emptyCause === 'all-other'}
		/>
	);
	const renderTrend = (_opts?: { fillParent: boolean }) => (
		effectiveSelection
			? (
				<TableSizeTrend
					derived={derived}
					viewMode="per-node"
					selectedTable={effectiveSelection}
					onChipSelect={setSelected}
					manualSelection={selected !== null}
					range={timeRange}
					clusterNodeIds={derivedClusterNodes(derived)}
					rankBy={rankBy}
					onRankChange={setRankBy}
				/>
			)
			: (
				<div className="h-64 rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center justify-center">
					No table selected.
				</div>
			)
	);

	return (
		<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
			<Card ref={snapshotCardRef}>
				<CardHeader className="flex flex-row items-start justify-between gap-2">
					<div className="flex-1 min-w-0">
						<CardTitle>Table size — snapshot</CardTitle>
						<CardDescription>
							Bytes per table, per node. Click a segment to pin the trend below.
						</CardDescription>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						<ChartExpandButton
							exportSlug="table-size-snapshot"
							title="Table size — snapshot"
							description="Bytes per table, per node."
							renderChart={renderSnapshot}
						/>
						<ChartCopyButton captureRef={snapshotCardRef} exportSlug="table-size-snapshot" />
						<ChartExportButton captureRef={snapshotCardRef} exportSlug="table-size-snapshot" />
					</div>
				</CardHeader>
				<CardContent>
					{renderSnapshot()}
				</CardContent>
			</Card>
			<Card ref={trendCardRef}>
				<CardHeader className="flex flex-row items-start justify-between gap-2">
					<div className="flex-1 min-w-0">
						<CardTitle>Table size — trend</CardTitle>
						<CardDescription>
							{effectiveSelection
								? `Growth of ${effectiveSelection} over the selected window.`
								: 'Pick a table to see its trend.'}
						</CardDescription>
					</div>
					{effectiveSelection && (
						<div className="flex items-center gap-1 shrink-0">
							<ChartExpandButton
								exportSlug="table-size-trend"
								title={`Table size — trend: ${effectiveSelection}`}
								description={`Growth of ${effectiveSelection} over the selected window.`}
								renderChart={renderTrend}
							/>
							<ChartCopyButton captureRef={trendCardRef} exportSlug="table-size-trend" />
							<ChartExportButton captureRef={trendCardRef} exportSlug="table-size-trend" />
						</div>
					)}
				</CardHeader>
				<CardContent>
					{renderTrend()}
				</CardContent>
			</Card>
		</div>
	);
}
