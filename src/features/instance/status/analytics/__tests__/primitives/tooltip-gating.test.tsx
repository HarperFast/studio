// @vitest-environment happy-dom
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type AnalyticsContextValue, AnalyticsProvider } from '../../context/AnalyticsContext';
import { LineChart } from '../../primitives/LineChart';
import type { SeriesData } from '../../types/analytics';

const data: SeriesData = {
	series: [{
		key: 's1',
		label: 'Series One',
		points: [{ x: 1_700_000_000_000, y: 10 }, { x: 1_700_000_060_000, y: 20 }],
	}],
};

function makeContextValue(syncId?: string): AnalyticsContextValue {
	return {
		timeRange: { startTime: 1_700_000_000_000, endTime: 1_700_000_060_000 },
		bucketMs: 60_000,
		instanceParams: {
			instanceClient: { post: async () => ({ data: [] }) } as never,
			entityId: 'test-instance' as never,
			entityType: 'instance',
		} satisfies InstanceClientIdConfig & InstanceTypeConfig,
		syncId,
	};
}

/** Real-Recharts integration check for the per-chart tooltip gate: two charts
 *  share a syncId; hovering one must render the tooltip box there only, while
 *  the synced sibling keeps the crosshair cursor line.
 *
 *  hideLegend is required in this environment: the getBoundingClientRect shim
 *  (setup.ts) reports 800×600 for every element, so a rendered <Legend> is
 *  "measured" at full chart height and Recharts computes an empty plot area,
 *  after which no pointer coordinate ever activates a tooltip. */
describe('tooltip gating with two synced charts', () => {
	afterEach(() => cleanup());

	it('renders the tooltip box only on the hovered chart, cursor on the synced sibling', async () => {
		render(
			<AnalyticsProvider value={makeContextValue('test:health')}>
				<div data-testid="chart-a">
					<LineChart data={data} hideLegend />
				</div>
				<div data-testid="chart-b">
					<LineChart data={data} hideLegend />
				</div>
			</AnalyticsProvider>,
		);
		const chartA = screen.getByTestId('chart-a');
		const chartB = screen.getByTestId('chart-b');
		await waitFor(() => {
			expect(chartA.querySelector('.recharts-wrapper svg')).toBeTruthy();
			expect(chartB.querySelector('.recharts-wrapper svg')).toBeTruthy();
		});

		// The hover gate lives on the chart's outer role=img container —
		// mouseOver (which React maps to onMouseEnter) must target it, while
		// Recharts activates the tooltip from mouseMove on its own wrapper.
		const gateA = chartA.querySelector('[role="img"]') as HTMLElement;
		fireEvent.mouseOver(gateA, { relatedTarget: document.body });
		const surfaceA = chartA.querySelector('.recharts-wrapper') as HTMLElement;
		fireEvent.mouseMove(surfaceA, { clientX: 400, clientY: 100 });

		// Hovered chart: full tooltip box.
		await waitFor(() => {
			expect(chartA.querySelector('.recharts-tooltip-wrapper')?.textContent ?? '').toMatch(/Series One/);
		});
		// Synced sibling: NO tooltip box…
		expect(chartB.querySelector('.recharts-tooltip-wrapper')?.textContent ?? '').toBe('');
		// …but the synced crosshair cursor line still draws (Recharts renders
		// the Tooltip `cursor` even when the content component returns null).
		expect(chartB.querySelector('.recharts-tooltip-cursor')).toBeTruthy();

		// Pointer leaves chart A: its tooltip box goes away too.
		fireEvent.mouseOut(gateA, { relatedTarget: document.body });
		await waitFor(() => {
			expect(chartA.querySelector('.recharts-tooltip-wrapper')?.textContent ?? '').toBe('');
		});
	});
});
