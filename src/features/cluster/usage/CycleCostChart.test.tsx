/**
 * @vitest-environment jsdom
 */
import type { PastCycle } from '@/integrations/api/cluster/getClusterUsageHistory';
import { cleanup, render, screen } from '@testing-library/react';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Real Recharts draws nothing at jsdom's 0×0, so record what the chart is handed instead.
const barChartCalls: Array<{ data: PastCycle[]; onClick: (state: unknown) => void; children: ReactNode }> = [];
vi.mock('recharts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('recharts')>();
	return {
		...actual,
		ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
		BarChart: (props: (typeof barChartCalls)[number]) => {
			barChartCalls.push(props);
			return null;
		},
	};
});

const { CycleCostChart, CycleCostTooltip, describeCostChart, showsCostChart } = await import(
	'@/features/cluster/usage/CycleCostChart'
);
const { Bar } = await import('recharts');

afterEach(() => {
	cleanup();
	barChartCalls.length = 0;
});

const cycle = (endsAt: string, over: Partial<PastCycle> = {}): PastCycle => ({
	startsAt: null,
	endsAt,
	planUsd: 85,
	overageUsd: 0,
	cycleUsd: 85,
	estimated: false,
	uninvoicedBlockCount: 0,
	stripeInvoiceIds: [],
	regions: [],
	...over,
});

const JUL = cycle('2026-07-28T19:17:46.624Z', { startsAt: '2026-06-28T19:17:46.624Z' });
const AUG = cycle('2026-08-28T19:17:46.624Z', { overageUsd: 25.5, cycleUsd: 110.5 });
const SEP = cycle('2026-09-28T19:17:46.624Z', { planUsd: 585, cycleUsd: 585, estimated: true });

describe('showsCostChart', () => {
	it('wants two cycles to compare, and something charged in them', () => {
		expect(showsCostChart([])).toBe(false);
		expect(showsCostChart([AUG])).toBe(false);
		expect(showsCostChart([AUG, JUL])).toBe(true);
		const free = { planUsd: 0, overageUsd: 0, cycleUsd: 0 };
		expect(showsCostChart([cycle('2026-08-28T00:00:00.000Z', free), cycle('2026-07-28T00:00:00.000Z', free)])).toBe(
			false,
		);
	});
});

describe('describeCostChart', () => {
	it('summarises the range of charges and how many cycles went over', () => {
		expect(describeCostChart([SEP, AUG, JUL])).toBe(
			'Charges for the 3 billing cycles shown, from $85.00 to $585.00; 1 with overage.',
		);
		expect(describeCostChart([JUL, JUL])).not.toMatch(/overage/);
	});
});

describe('CycleCostChart', () => {
	it('plots the cycles oldest first, labelled for screen readers', () => {
		render(<CycleCostChart cycles={[SEP, AUG, JUL]} onSelect={vi.fn()} />);
		expect(barChartCalls.at(-1)?.data.map((row) => row.endsAt)).toEqual([JUL.endsAt, AUG.endsAt, SEP.endsAt]);
		expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Charges for the 3 billing cycles shown/);
	});

	it('names the cycle under a selected bar, and nothing for a click between bars', () => {
		const onSelect = vi.fn();
		render(<CycleCostChart cycles={[AUG, JUL]} onSelect={onSelect} />);
		const { onClick } = barChartCalls.at(-1)!;
		onClick({ activeLabel: AUG.endsAt });
		onClick({ activeLabel: undefined });
		onClick(null);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(AUG.endsAt);
	});

	it('fades an estimated cycle and says what faded means', () => {
		render(<CycleCostChart cycles={[SEP, AUG]} onSelect={vi.fn()} />);
		const bars = Children.toArray(barChartCalls.at(-1)!.children).filter(
			(child): child is ReactElement<{ dataKey: string; shape: (props: unknown) => ReactElement }> =>
				isValidElement(child) && child.type === Bar,
		);
		expect(bars.map((bar) => bar.props.dataKey)).toEqual(['planUsd', 'overageUsd']);
		const opacity = (row: PastCycle) =>
			(bars[0].props.shape({ payload: row, x: 0, y: 0, width: 10, height: 10 }).props as { fillOpacity: number })
				.fillOpacity;
		expect(opacity(SEP)).toBeLessThan(1);
		expect(opacity(AUG)).toBe(1);
		expect(screen.getByText('Faded bars are estimates.')).toBeTruthy();

		cleanup();
		render(<CycleCostChart cycles={[AUG, JUL]} onSelect={vi.fn()} />);
		expect(screen.queryByText('Faded bars are estimates.')).toBeNull();
	});
});

describe('CycleCostTooltip', () => {
	it("shows the cycle's dates, plan, overage and total", () => {
		render(<CycleCostTooltip active payload={[{ payload: { ...AUG, startsAt: '2026-07-28T19:17:46.624Z' } }]} />);
		expect(screen.getByText(/Jul 28\s*–\s*Aug 28, 2026/)).toBeTruthy();
		expect(screen.getByText('$85.00')).toBeTruthy();
		expect(screen.getByText('$25.50')).toBeTruthy();
		expect(screen.getByText('$110.50')).toBeTruthy();
		expect(screen.queryByText(/Estimated/)).toBeNull();
	});

	it('leaves out an overage of nothing, and marks an estimate and an uninvoiced charge', () => {
		render(<CycleCostTooltip active payload={[{ payload: { ...SEP, uninvoicedBlockCount: 1 } }]} />);
		expect(screen.queryByText('Overage')).toBeNull();
		expect(screen.getByText('≈ $585.00')).toBeTruthy();
		expect(screen.getByText(/Estimated at the plan’s current price/)).toBeTruthy();
		expect(screen.getByText('Not on an invoice yet.')).toBeTruthy();
	});

	it('renders nothing off a bar', () => {
		const { container } = render(<CycleCostTooltip active={false} payload={[{ payload: AUG }]} />);
		expect(container.innerHTML).toBe('');
	});
});
