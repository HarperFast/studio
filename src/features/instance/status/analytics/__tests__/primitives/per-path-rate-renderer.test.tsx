// @vitest-environment happy-dom
// PerPathRateRenderer (request-rate) reaches the chart through a custom
// Renderer, so it skips runPipeline's downsample pass and MetricRenderer's
// derived-fold. It must fold its own computed series or a wide window renders
// one point per 60 s next to panels capped at ~180 (#1588 review). Rendering
// the real recharts LineChart gives no point-count signal, so swap it for a
// prop recorder and read the series it receives.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '../../context/timePresets';
import type { SeriesData, TimeRange } from '../../types/analytics';

const lineChartCalls: { data: SeriesData }[] = [];
vi.mock('../../primitives/LineChart', () => ({
	LineChart: (props: { data: SeriesData }) => {
		lineChartCalls.push(props);
		return null;
	},
}));

const { PerPathRateRenderer } = await import('../../primitives/PerPathRateRenderer');

afterEach(() => {
	cleanup();
	lineChartCalls.length = 0;
});

const preset = getPreset('30d');
const WINDOW: TimeRange = { startTime: 0, endTime: preset.durationMs };
// A dense computed series — one point every 10 min across 30 d = 4320 points.
const RAW_POINTS = Math.round(preset.durationMs / (10 * 60_000));
const denseSeries: SeriesData = {
	series: [{
		key: '/a',
		label: '/a',
		points: Array.from({ length: RAW_POINTS }, (_, i) => ({ x: i * 10 * 60_000, y: 100, count: 5 })),
	}],
};
const compute = () => denseSeries;

const lastData = () => lineChartCalls.at(-1)!.data;

describe('PerPathRateRenderer downsample wiring', () => {
	it('folds the computed series to the window resolution before charting', () => {
		render(
			<PerPathRateRenderer records={[]} timeRange={WINDOW} nodes={[]} viewMode="aggregate" compute={compute} />,
		);
		const points = lastData().series.find((s) => s.key === '/a')!.points;
		// 30d preset → 4h bucket → ~180 points, not the 4320 raw.
		const intended = Math.round(preset.durationMs / preset.bucketMs);
		expect(RAW_POINTS).toBeGreaterThan(4000); // sanity: the raw series really is dense
		expect(points.length).toBeLessThanOrEqual(intended + 1);
		expect(points.length).toBeLessThan(RAW_POINTS);
	});

	it('leaves the series at full resolution when no window is supplied', () => {
		// Guards that the fold is driven by timeRange, not applied blindly.
		render(<PerPathRateRenderer records={[]} nodes={[]} viewMode="aggregate" compute={compute} />);
		expect(lastData().series.find((s) => s.key === '/a')!.points).toHaveLength(RAW_POINTS);
	});
});
