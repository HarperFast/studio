import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { RefreshCw } from 'lucide-react';
import { useAnalyticsContext } from '../context/AnalyticsContext';
import { REFRESH_OPTIONS, TIME_PRESETS, type TimePresetId } from '../context/timePresets';
import { formatRelativeUpdate, useAnalyticsFreshness } from '../hooks/useAnalyticsFreshness';

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
		<div className="flex items-center gap-2">
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
				<SelectTrigger className="w-[180px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{TIME_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
				</SelectContent>
			</Select>
			<Select value={String(refreshMs)} onValueChange={(v) => onRefreshChange(Number(v))}>
				<SelectTrigger className="w-[100px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{REFRESH_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
				</SelectContent>
			</Select>
			<Button
				variant="ghost"
				size="icon"
				onClick={onManualRefresh}
				disabled={isFetching}
				aria-busy={isFetching}
				aria-label={isFetching ? 'Refreshing…' : 'Refresh now'}
				title={isFetching ? 'Refreshing…' : 'Refresh now'}
			>
				<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
			</Button>
		</div>
	);
}
