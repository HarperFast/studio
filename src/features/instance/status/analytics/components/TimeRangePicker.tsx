import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { RefreshCw } from 'lucide-react';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { formatBucketLabel, getPreset, REFRESH_OPTIONS, TIME_PRESETS, type TimePresetId } from '../context/timePresets';
import { formatRelativeUpdate, useAnalyticsFreshness } from '../hooks/useAnalyticsFreshness';

/** Range label as two stacked lines: the window on top, the resolution it
 *  renders at ("by 10 minutes") beneath. Shared by the dropdown options and
 *  the collapsed trigger so both read the same. */
function RangeLabel({ presetId }: { presetId: TimePresetId }) {
	const preset = getPreset(presetId);
	return (
		<span className="flex flex-col items-start leading-tight">
			<span>{preset.label}</span>
			<span className="text-[11px] font-normal text-muted-foreground">by {formatBucketLabel(preset.bucketMs)}</span>
		</span>
	);
}

interface Props {
	presetId: TimePresetId;
	onPresetChange: (id: TimePresetId) => void;
	refreshMs: number;
	onRefreshChange: (ms: number) => void;
	onManualRefresh: () => void;
}

export function TimeRangePicker({
	presetId,
	onPresetChange,
	refreshMs,
	onRefreshChange,
	onManualRefresh,
}: Props) {
	const { instanceParams } = useAnalyticsContext();
	const { isFetching, lastFetchedAt, now } = useAnalyticsFreshness(instanceParams.entityId);
	const updatedLabel = formatRelativeUpdate(lastFetchedAt, now);

	return (
		// gap-3 between groups, 0 inside the refresh group — the spacing is what
		// tells you the interval belongs to the refresh action rather than to the
		// range picker beside it.
		<div className="flex items-center gap-3">
			{updatedLabel && (
				<span
					className="text-xs text-muted-foreground tabular-nums"
					// No aria-live: a self-ticking timestamp causes screen
					// readers to re-announce every interval. Full ISO time
					// is exposed via title for hover.
					title={lastFetchedAt ? new Date(lastFetchedAt).toLocaleString() : undefined}
					aria-label={lastFetchedAt ? `Last updated ${new Date(lastFetchedAt).toLocaleString()}` : undefined}
				>
					Updated {updatedLabel}
				</span>
			)}
			<Select value={presetId} onValueChange={(v) => onPresetChange(v as TimePresetId)}>
				{
					/* h-auto so the two-line label isn't clipped by the trigger's
				    default h-9. Explicit children on SelectValue (not a bare
				    <SelectValue/>) so the collapsed trigger shows the same
				    window + resolution stack the options do. */
				}
				<SelectTrigger className="h-auto min-h-9 w-[180px] py-1">
					<SelectValue>
						<RangeLabel presetId={presetId} />
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{TIME_PRESETS.map((p) => (
						<SelectItem key={p.id} value={p.id}>
							<RangeLabel presetId={p.id} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{
				/* Auto-refresh interval + refresh-now, joined into one control. Sat as
			    a bare Select next to the range picker before, at the same gap and
			    the same weight, so "60s" read as a second time setting — a chart
			    granularity — rather than "re-fetch every 60s". Attaching it to the
			    refresh icon is what disambiguates it; the shared border/background
			    lives on this wrapper and the children opt out of their own. */
			}
			<div
				role="group"
				aria-label="Auto-refresh"
				className="flex items-center rounded-md border border-input bg-white shadow-xs dark:bg-grey-700"
			>
				<Select value={String(refreshMs)} onValueChange={(v) => onRefreshChange(Number(v))}>
					<SelectTrigger
						aria-label="Auto-refresh interval"
						title="Auto-refresh interval"
						className="w-[88px] rounded-r-none border-0 bg-transparent shadow-none dark:bg-transparent"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{REFRESH_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
					</SelectContent>
				</Select>
				<span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
				<Button
					variant="ghost"
					size="icon"
					onClick={onManualRefresh}
					disabled={isFetching}
					aria-busy={isFetching}
					aria-label={isFetching ? 'Refreshing…' : 'Refresh now'}
					title={isFetching ? 'Refreshing…' : 'Refresh now'}
					className="rounded-l-none"
				>
					<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
				</Button>
			</div>
		</div>
	);
}
