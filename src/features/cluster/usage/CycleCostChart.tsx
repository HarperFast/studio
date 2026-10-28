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

const PLAN_COLOR = '#58BFA5';
const OVERAGE_COLOR = '#E8AD55';

const END_MONTH = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
const AXIS_USD = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	notation: 'compact',
	maximumFractionDigits: 1,
});
const HEADROOM = 1.15;
const NICE_STEPS = [1, 1.5, 2, 2.5, 5, 10];
const TOP_RADIUS: [number, number, number, number] = [3, 3, 0, 0];

/** A trend needs two cycles, and a cluster never charged has nothing to plot. */
export function showsCostChart(cycles: PastCycle[]): boolean {
	return cycles.length >= 2 && cycles.some((cycle) => cycle.cycleUsd > 0);
}

/** Gridlines on round amounts, with the axis running past the tallest bar so it never meets the frame. */
export function costAxis(maxUsd: number): { top: number; ticks: number[] } {
	if (!(maxUsd > 0)) { return { top: 1, ticks: [0] }; }
	const top = maxUsd * HEADROOM;
	const rough = maxUsd / 4;
	const magnitude = 10 ** Math.floor(Math.log10(rough));
	const step = NICE_STEPS.map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? rough;
	const ticks = Array.from(
		{ length: Math.floor(top / step) + 1 },
		(_, index) => Math.round(index * step * 100) / 100,
	);
	return { top, ticks };
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
function costShape(roundsTop: (cycle: PastCycle) => boolean) {
	return (props: BarShapeProps) => {
		const cycle = props.payload as PastCycle | undefined;
		return (
			<Rectangle
				{...props}
				radius={cycle && roundsTop(cycle) ? TOP_RADIUS : 0}
				fillOpacity={cycle?.estimated ? 0.4 : 1}
			/>
		);
	};
}
const planShape = costShape((cycle) => !(cycle.overageUsd > 0));
const overageShape = costShape(() => true);

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

export function CycleCostChart(
	{ cycles, onSelect }: { cycles: PastCycle[]; onSelect: (endsAt: string) => void },
) {
	const rows = [...cycles].reverse();
	const { axisColor, gridColor } = getChartColors();
	const axis = costAxis(Math.max(...cycles.map((cycle) => cycle.cycleUsd)));
	// The clicked bar's own row: the chart-level click reads hover state, which lags the pointer by a frame.
	const selectBar = (bar: { payload?: unknown }) => {
		const endsAt = (bar.payload as PastCycle | undefined)?.endsAt;
		if (endsAt) { onSelect(endsAt); }
	};
	return (
		<figure className="rounded-xl border border-border px-4 pb-3 pt-4">
			<div role="img" aria-label={describeCostChart(cycles)} className="h-48 w-full">
				<div aria-hidden="true" className="h-full w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={rows}>
							<CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="endsAt" tickFormatter={endMonth} stroke={axisColor} tick={{ fontSize: 11 }} />
							<YAxis
								domain={[0, axis.top]}
								ticks={axis.ticks}
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
								fill={PLAN_COLOR}
								className="cursor-pointer"
								shape={planShape}
								onClick={selectBar}
								isAnimationActive={false}
							/>
							<Bar
								dataKey="overageUsd"
								name="Overage"
								stackId="cost"
								fill={OVERAGE_COLOR}
								className="cursor-pointer"
								shape={overageShape}
								onClick={selectBar}
								isAnimationActive={false}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
			<figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: PLAN_COLOR }} />
					Plan
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: OVERAGE_COLOR }} />
					Overage
				</span>
				{cycles.some((cycle) => cycle.estimated) && <span>Faded bars are estimates.</span>}
				<span className="sm:ml-auto">Select a bar to open that cycle.</span>
			</figcaption>
		</figure>
	);
}
