// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeriesData } from '../../types/analytics';

// StackedAreaChart and TableSizeTrend render an unconditional <Legend>, which
// under the setup.ts getBoundingClientRect shim measures at full chart height
// and leaves Recharts no plot area — real tooltip activation can't fire (see
// tooltip-gating.test.tsx, which covers LineChart end-to-end via hideLegend).
// So for these two, capture the props handed to the Recharts wrappers and
// assert the gating contract: Tooltip has isAnimationActive={false} and its
// content's `hidden` tracks the container hover state.
const lineChartCalls: Record<string, unknown>[] = [];
const areaChartCalls: Record<string, unknown>[] = [];

vi.mock('recharts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('recharts')>();
	return {
		...actual,
		LineChart: (props: Record<string, unknown>) => {
			lineChartCalls.push(props);
			return null;
		},
		AreaChart: (props: Record<string, unknown>) => {
			areaChartCalls.push(props);
			return null;
		},
	};
});

const { Tooltip } = await import('recharts');
const { StackedAreaChart } = await import('../../primitives/StackedAreaChart');
const { TableSizeTrend } = await import('../../charts/TableSizeTrend');
type TableSizeDerived = import('../../lib/tableSize').TableSizeDerived;

function findTooltip(call: Record<string, unknown>): ReactElement<Record<string, unknown>> {
	const children = Children.toArray(call.children as ReactNode);
	const tooltip = children.find((c): c is ReactElement<Record<string, unknown>> =>
		isValidElement(c) && c.type === Tooltip
	);
	expect(tooltip, 'chart renders a <Tooltip>').toBeTruthy();
	return tooltip!;
}

function tooltipContentHidden(call: Record<string, unknown>): unknown {
	const content = findTooltip(call).props.content as ReactElement<Record<string, unknown>>;
	return content.props.hidden;
}

const data: SeriesData = {
	series: [{ key: 's1', label: 'Series One', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }],
};

const derived: TableSizeDerived = {
	snapshot: { byNode: [], tableSet: ['db.t1'], hasOther: false, otherMembers: [] },
	trend: () => [
		{ time: 1_000, values: { n1: 100 } },
		{ time: 2_000, values: { n1: 200 } },
	],
	defaultSelection: () => 'db.t1',
	emptyCause: null,
	signature: 'sig',
};
const trendProps = {
	derived,
	viewMode: 'per-node' as const,
	selectedTable: 'db.t1',
	onChipSelect: () => {},
	manualSelection: true,
	range: { startTime: 0, endTime: 60_000 },
	clusterNodeIds: ['n1'],
	rankBy: 'bytes' as const,
	onRankChange: () => {},
};

describe('tooltip gating props (StackedAreaChart / TableSizeTrend)', () => {
	beforeEach(() => {
		lineChartCalls.length = 0;
		areaChartCalls.length = 0;
	});
	afterEach(() => cleanup());

	it('StackedAreaChart: Tooltip animation off; content hidden until the container is hovered', () => {
		const { container } = render(<StackedAreaChart data={data} />);
		expect(findTooltip(areaChartCalls.at(-1)!).props.isAnimationActive).toBe(false);
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(true);

		const gate = container.querySelector('[role="img"]') as HTMLElement;
		fireEvent.mouseOver(gate, { relatedTarget: document.body });
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(false);

		fireEvent.mouseOut(gate, { relatedTarget: document.body });
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(true);
	});

	it('StackedAreaChart: touch and keyboard focus open the gate too (Recharts activates tooltips for both)', () => {
		const { container } = render(<StackedAreaChart data={data} />);
		const gate = container.querySelector('[role="img"]') as HTMLElement;

		fireEvent.touchStart(gate);
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(false);
		// Touch has no "leave" — the gate stays open until a close interaction.
		fireEvent.focusIn(gate);
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(false);
		fireEvent.focusOut(gate);
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(true);

		fireEvent.focusIn(gate);
		expect(tooltipContentHidden(areaChartCalls.at(-1)!)).toBe(false);
	});

	it('TableSizeTrend: Tooltip animation off; content hidden until the chart container is hovered', () => {
		const { container } = render(<TableSizeTrend {...trendProps} />);
		expect(findTooltip(lineChartCalls.at(-1)!).props.isAnimationActive).toBe(false);
		expect(tooltipContentHidden(lineChartCalls.at(-1)!)).toBe(true);

		const gate = container.querySelector('.recharts-responsive-container')!.parentElement as HTMLElement;
		fireEvent.mouseOver(gate, { relatedTarget: document.body });
		expect(tooltipContentHidden(lineChartCalls.at(-1)!)).toBe(false);

		fireEvent.mouseOut(gate, { relatedTarget: document.body });
		expect(tooltipContentHidden(lineChartCalls.at(-1)!)).toBe(true);
	});
});
