/** @vitest-environment jsdom */
// Registry-wide panel smoke test — the unit-test form of the "do the metrics
// panels actually load?" browser verification pass. Every specRegistry entry
// renders through the same MetricRenderer dispatch MetricPanel uses, inside
// the real PanelErrorBoundary, fed synthetic records shaped from the spec's
// own required fields. Catches the "refactor broke a renderer nobody's test
// imports" class (e.g. a registry retarget dropping a spec) without a browser.
//
// Assertion is two-tier: NO metric may trip the error boundary or the
// render-failed fallback, and the well-known chart-backed metrics must
// actually produce recharts SVG (guards against a vacuous pass where every
// panel silently renders its empty state).
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getSpecRequiredFields } from '../lib/specRequiredFields';
import { specRegistry } from '../pipeline/index';
import { QUANTILE_FIELDS } from '../pipeline/quantileFields';
import { MetricRenderer } from '../primitives/MetricRenderer';
import { PanelErrorBoundary } from '../tabs/PanelErrorBoundary';
import type { AnalyticsDataPoint, TimeRange } from '../types/analytics';

const T0 = 1_752_000_000_000;
const NODES = ['node-a', 'node-b'];
const WINDOW: TimeRange = { startTime: T0, endTime: T0 + 6 * 60_000 };

/** Quantile columns are deliberately NOT in getSpecRequiredFields (they're
 *  treated as picker alternates there — see its docstring), but p95 is the
 *  default axis on the quantile-bearing specs, so records must carry them
 *  for those charts to draw. `count`/`total` feed the count-weighted-mean
 *  aggregators. */
const COMMON_NUMERIC_FIELDS = [
	...QUANTILE_FIELDS.map((quantile) => quantile.field),
	'count',
	'total',
	'mean',
];

/** Six buckets × two nodes of records carrying every field the spec's
 *  default view reads (per getSpecRequiredFields) plus the common quantile
 *  and count columns, plus every dimension the spec groups or filters on.
 *  Values are small positive numbers so ratio-style fields (success rates,
 *  cache hits) stay in-domain. */
function syntheticRecords(metric: string): AnalyticsDataPoint[] {
	const fields = getSpecRequiredFields(metric);
	const spec = specRegistry[metric]?.spec;
	const dimensions = new Set<string>();
	if (spec?.series.kind === 'groupBy') { dimensions.add(spec.series.dimension); }
	for (const dim of [spec?.primaryDimension, spec?.subDimension].flat()) {
		if (dim) { dimensions.add(dim); }
	}
	dimensions.delete('node');
	const records: AnalyticsDataPoint[] = [];
	for (let bucket = 0; bucket < 6; bucket++) {
		for (const node of NODES) {
			const record: AnalyticsDataPoint = {
				time: T0 + bucket * 60_000,
				period: 60,
				node,
			};
			for (const field of [...fields, ...COMMON_NUMERIC_FIELDS]) {
				record[field] = 1 + bucket;
			}
			// Big enough that Σcount per series clears every spec's
			// confidence gate (duration et al. suppress below 100 samples);
			// `total` stays small so error-ratio fields (1 − total/count)
			// remain in-domain.
			record.count = 500;
			record.total = 5;
			for (const dim of dimensions) {
				record[dim] = bucket % 2 === 0 ? 'alpha' : 'beta';
			}
			// Re-stamp the structural columns last so a spec that lists
			// time/period/node among its required fields can't corrupt the
			// record's timestamp (which would silently eject it from WINDOW).
			// `id` mirrors `time` for the specs with `timestamp: 'id'`
			// (database-size, storage-volume).
			record.time = T0 + bucket * 60_000;
			record.id = record.time;
			record.period = 60;
			record.node = node;
			records.push(record);
		}
	}
	return records;
}

/** Metrics whose default view is a recharts cartesian chart — these must
 *  emit SVG, not just avoid crashing. Derived from the spec's primitive so
 *  a newly registered line/stacked-area metric is automatically held to the
 *  chart tier (a hardcoded list would silently exempt new metrics).
 *  Non-cartesian primitives (heatmap, small-multiples) are dispatched to
 *  bespoke DOM and stay in the no-crash tier only. */
const MUST_RENDER_CHART = Object.keys(specRegistry).filter((metric) => {
	const primitive = specRegistry[metric].spec.primitive;
	return primitive === 'line' || primitive === 'stacked-area';
});

describe('spec registry smoke — every registered metric renders without tripping the panel boundary', () => {
	for (const metric of Object.keys(specRegistry)) {
		it(`renders '${metric}'`, () => {
			const { container } = render(
				<PanelErrorBoundary metric={metric}>
					<MetricRenderer
						metric={metric}
						records={syntheticRecords(metric)}
						window={WINDOW}
						nodes={NODES}
					/>
				</PanelErrorBoundary>,
			);
			const text = container.textContent ?? '';
			expect(text).not.toContain('is unavailable'); // PanelErrorBoundary tripped
			expect(text).not.toContain('Render failed'); // MetricRenderer error fallback
		});
	}

	for (const metric of MUST_RENDER_CHART) {
		it(`'${metric}' produces an actual chart from populated records`, () => {
			const { container } = render(
				<PanelErrorBoundary metric={metric}>
					<MetricRenderer
						metric={metric}
						records={syntheticRecords(metric)}
						window={WINDOW}
						nodes={NODES}
					/>
				</PanelErrorBoundary>,
			);
			expect(container.querySelector('.recharts-responsive-container, svg')).not.toBeNull();
			expect(container.textContent ?? '').not.toContain('No data in window');
		});
	}
});
