import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatValue } from '@/lib/formatValue';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatWindowLabel, type KpiDelta } from './kpiMath';
import { KpiSparkline } from './KpiSparkline';
import type { KpiTileDef } from './kpiTiles';
import { useKpiTileData } from './useKpiTileData';

/** One stat tile: label, latest-bucket value, delta vs the previous window,
 *  current-window sparkline. Data absent → em-dash value, no delta, empty
 *  sparkline; loading → skeleton. */
export function KpiTile({ def }: { def: KpiTileDef }) {
	const { latest, delta, sparkPoints, isLoading, timeRange, windowMs } = useKpiTileData(def);

	return (
		<Card className="gap-2 py-4">
			<div className="flex min-w-0 flex-col gap-1 px-4">
				<div className="truncate text-xs text-muted-foreground">{def.label}</div>
				{isLoading
					? (
						<div role="status" aria-live="polite" aria-label={`Loading ${def.label}`} className="flex flex-col gap-2">
							<Skeleton className="h-7 w-20" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-8 w-full" />
						</div>
					)
					: (
						<>
							<div className="text-2xl font-semibold leading-tight">
								{formatValue(latest, def.formatter)}
							</div>
							<DeltaRow delta={latest === null ? null : delta} windowMs={windowMs} />
							<KpiSparkline points={sparkPoints} xDomain={[timeRange.startTime, timeRange.endTime]} />
						</>
					)}
			</div>
		</Card>
	);
}

/** Delta line under the value. All strip vitals are up-is-bad (see
 *  kpiTiles.ts), so up wears destructive and down wears green. Height is
 *  reserved when the delta is unavailable so the five tiles stay aligned. */
function DeltaRow({ delta, windowMs }: { delta: KpiDelta | null; windowMs: number }) {
	if (!delta) { return <div className="h-4" aria-hidden="true" />; }
	const windowLabel = formatWindowLabel(windowMs);
	// Unsign a pct that ROUNDS to zero — "+0.0%" reads as a real move.
	const rounded = delta.pct.toFixed(1);
	const pctText = rounded === '0.0' || rounded === '-0.0'
		? '0.0%'
		: `${delta.pct >= 0 ? '+' : ''}${rounded}%`;
	const color = delta.direction === 'up'
		? 'text-destructive'
		: delta.direction === 'down'
		? 'text-green'
		: 'text-muted-foreground';
	const Icon = delta.direction === 'up' ? ArrowUp : delta.direction === 'down' ? ArrowDown : Minus;
	return (
		<div
			role="img"
			className="flex h-4 items-center gap-1 text-xs"
			aria-label={`${delta.direction} ${pctText} vs previous ${windowLabel}`}
		>
			<Icon className={`size-3 shrink-0 ${color}`} aria-hidden="true" />
			<span className={`font-medium ${color}`}>{pctText}</span>
			<span className="truncate text-muted-foreground">vs prev {windowLabel}</span>
		</div>
	);
}
