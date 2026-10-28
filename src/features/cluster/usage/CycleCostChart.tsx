import { cycleRange } from '@/features/cluster/usage/cycleRange';
import { getChartColors } from '@/features/instance/status/analytics/lib/theme';
import { tooltipContentStyle, tooltipLabelStyle } from '@/features/instance/status/analytics/primitives/tooltipStyle';
import type { PastCycle } from '@/integrations/api/cluster/getClusterUsageHistory';
import { toUSD } from '@/lib/toUSD';
import {
	Bar,
	BarChart,
	type BarShapeProps,
	CartesianGrid,
	Rectangle,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

const END_MONTH = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
const AXIS_USD = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	notation: 'compact',
	maximumFractionDigits: 1,
});

/** A trend needs two cycles, and a cluster never charged has nothing to plot. */
export function showsCostChart(cycles: PastCycle[]): boolean {
	return cycles.length >= 2 && cycles.some((cycle) => cycle.cycleUsd > 0);
}

function endMonth(endsAt: string): string {
	const end = new Date(endsAt);
	return Number.isNaN(end.getTime()) ? '' : END_MONTH.format(end);
}

export function describeCostChart(cycles: PastCycle[]): string {
	const amounts = cycles.map((cycle) => cycle.cycleUsd);
	const withOverage = cycles.filter((cycle) => cycle.overageUsd > 0).length;
	return `Charges for the ${cycles.length} billing cycles shown, from ${toUSD(Math.min(...amounts))} to ${
		toUSD(Math.max(...amounts))
	}${withOverage > 0 ? `; ${withOverage} with overage` : ''}.`;
}

// Faded, not hidden: an estimate is still the best figure there is for that cycle.
const costShape = (props: BarShapeProps) => (
	<Rectangle {...props} fillOpacity={(props.payload as PastCycle | undefined)?.estimated ? 0.5 : 1} />
);

export function CycleCostTooltip(
	{ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> },
) {
	const cycle = payload?.[0]?.payload as PastCycle | undefined;
	if (!active || !cycle) { return null; }
	return (
		<div style={tooltipContentStyle}>
			<div style={tooltipLabelStyle}>{cycleRange(cycle)}</div>
			<dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-0.5">
				<dt>Plan</dt>
				<dd className="text-right tabular-nums">{toUSD(cycle.planUsd)}</dd>
				{cycle.overageUsd > 0 && (
					<>
						<dt>Overage</dt>
						<dd className="text-right tabular-nums">{toUSD(cycle.overageUsd)}</dd>
					</>
				)}
				<dt className="font-medium">Total</dt>
				<dd className="text-right font-medium tabular-nums">
					{cycle.estimated ? '≈ ' : ''}
					{toUSD(cycle.cycleUsd)}
				</dd>
			</dl>
			{cycle.estimated && <p className="mt-1 opacity-70">Estimated at the plan&rsquo;s current price.</p>}
			{cycle.uninvoicedBlockCount > 0 && <p className="mt-1 opacity-70">Not on an invoice yet.</p>}
		</div>
	);
}

/** Charges per cycle, oldest on the left; selecting a bar names the cycle by its `endsAt`. */
export function CycleCostChart(
	{ cycles, onSelect }: { cycles: PastCycle[]; onSelect: (endsAt: string) => void },
) {
	const rows = [...cycles].reverse();
	const { axisColor, gridColor } = getChartColors();
	return (
		<figure className="rounded-xl border border-border px-4 pb-3 pt-4">
			<div role="img" aria-label={describeCostChart(cycles)} className="h-48 w-full">
				<div aria-hidden="true" className="h-full w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={rows}
							maxBarSize={32}
							style={{ cursor: 'pointer' }}
							onClick={(state) => {
								if (typeof state?.activeLabel === 'string') { onSelect(state.activeLabel); }
							}}
						>
							<CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="endsAt" tickFormatter={endMonth} stroke={axisColor} tick={{ fontSize: 11 }} />
							<YAxis
								tickFormatter={(value: number) => AXIS_USD.format(value)}
								stroke={axisColor}
								tick={{ fontSize: 11 }}
								width={56}
							/>
							<Tooltip
								isAnimationActive={false}
								cursor={{ fill: 'var(--color-accent)', fillOpacity: 0.4 }}
								content={CycleCostTooltip}
							/>
							<Bar
								dataKey="planUsd"
								name="Plan"
								stackId="cost"
								fill="currentColor"
								className="text-primary/45 dark:text-violet-400/45"
								shape={costShape}
								isAnimationActive={false}
							/>
							<Bar
								dataKey="overageUsd"
								name="Overage"
								stackId="cost"
								fill="currentColor"
								className="text-yellow"
								shape={costShape}
								isAnimationActive={false}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
			<figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="size-2.5 rounded-sm bg-primary/45 dark:bg-violet-400/45" />
					Plan
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="size-2.5 rounded-sm bg-yellow" />
					Overage
				</span>
				{cycles.some((cycle) => cycle.estimated) && <span>Faded bars are estimates.</span>}
				<span className="sm:ml-auto">Select a bar to open that cycle.</span>
			</figcaption>
		</figure>
	);
}
