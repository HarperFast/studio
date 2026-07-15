// @vitest-environment happy-dom
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AnalyticsContextValue, AnalyticsProvider } from '../../context/AnalyticsContext';
import type { SeriesData } from '../../types/analytics';

// Capture the props the primitives hand to the Recharts wrapper components.
// Rendering real Recharts gives no DOM signal for syncId (it lives in
// Recharts' internal store), so swap the two wrappers for prop recorders.
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

// Import after the mock so the primitives bind to the stubbed wrappers.
const { LineChart } = await import('../../primitives/LineChart');
const { StackedAreaChart } = await import('../../primitives/StackedAreaChart');
const { TableSizeTrend } = await import('../../charts/TableSizeTrend');
type TableSizeDerived = import('../../lib/tableSize').TableSizeDerived;

const data: SeriesData = {
	series: [{ key: 's1', label: 'Series One', points: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }],
};

function makeContextValue(syncId?: string): AnalyticsContextValue {
	return {
		timeRange: { startTime: 0, endTime: 60_000 },
		bucketMs: 60_000,
		instanceParams: {
			instanceClient: { post: async () => ({ data: [] }) } as never,
			entityId: 'test-instance' as never,
			entityType: 'instance',
		} satisfies InstanceClientIdConfig & InstanceTypeConfig,
		syncId,
	};
}

function withProvider(children: ReactNode, syncId?: string) {
	return <AnalyticsProvider value={makeContextValue(syncId)}>{children}</AnalyticsProvider>;
}

describe('tab-scoped chart crosshair sync (syncId)', () => {
	beforeEach(() => {
		lineChartCalls.length = 0;
		areaChartCalls.length = 0;
	});
	afterEach(() => cleanup());

	it('LineChart passes the context syncId and syncMethod="value" to Recharts', () => {
		render(withProvider(<LineChart data={data} />, 'test-instance:health'));
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBe('test-instance:health');
		expect(lineChartCalls[0].syncMethod).toBe('value');
	});

	it('StackedAreaChart passes the context syncId and syncMethod="value" to Recharts', () => {
		render(withProvider(<StackedAreaChart data={data} />, 'test-instance:traffic'));
		expect(areaChartCalls.length).toBeGreaterThan(0);
		expect(areaChartCalls[0].syncId).toBe('test-instance:traffic');
		expect(areaChartCalls[0].syncMethod).toBe('value');
	});

	// The expand dialog (the only fillParent caller) gets a separate sync
	// scope: never the tab's id, so it can't drive the panels behind the
	// overlay, but SmallMultiples dialogs keep intra-dialog sync.
	it('LineChart with fillParent (expand dialog) uses the dialog scope, not the tab scope', () => {
		render(withProvider(<LineChart data={data} fillParent />, 'test-instance:health'));
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBe('test-instance:health:expanded');
		expect(lineChartCalls[0].syncMethod).toBe('value');
	});

	it('StackedAreaChart with fillParent (expand dialog) uses the dialog scope, not the tab scope', () => {
		render(withProvider(<StackedAreaChart data={data} fillParent />, 'test-instance:traffic'));
		expect(areaChartCalls.length).toBeGreaterThan(0);
		expect(areaChartCalls[0].syncId).toBe('test-instance:traffic:expanded');
		expect(areaChartCalls[0].syncMethod).toBe('value');
	});

	it('LineChart outside any AnalyticsProvider gets no syncId', () => {
		render(<LineChart data={data} />);
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBeUndefined();
		expect(lineChartCalls[0].syncMethod).toBeUndefined();
	});

	it('StackedAreaChart outside any AnalyticsProvider gets no syncId', () => {
		render(<StackedAreaChart data={data} />);
		expect(areaChartCalls.length).toBeGreaterThan(0);
		expect(areaChartCalls[0].syncId).toBeUndefined();
		expect(areaChartCalls[0].syncMethod).toBeUndefined();
	});

	it('a provider without syncId (e.g. legacy context value) does not sync charts', () => {
		render(withProvider(<LineChart data={data} />));
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBeUndefined();
	});

	// TableSizeTrend (Storage tab) builds its chart from raw Recharts rather
	// than the primitives, so it gets the same treatment separately.
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

	it('TableSizeTrend passes the context syncId and syncMethod="value" to Recharts', () => {
		render(withProvider(<TableSizeTrend {...trendProps} />, 'test-instance:storage'));
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBe('test-instance:storage');
		expect(lineChartCalls[0].syncMethod).toBe('value');
	});

	it('TableSizeTrend in the expand dialog uses the dialog scope, not the tab scope', () => {
		render(withProvider(<TableSizeTrend {...trendProps} inExpandDialog />, 'test-instance:storage'));
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBe('test-instance:storage:expanded');
		expect(lineChartCalls[0].syncMethod).toBe('value');
	});

	it('TableSizeTrend outside any AnalyticsProvider gets no syncId', () => {
		render(<TableSizeTrend {...trendProps} />);
		expect(lineChartCalls.length).toBeGreaterThan(0);
		expect(lineChartCalls[0].syncId).toBeUndefined();
	});
});
