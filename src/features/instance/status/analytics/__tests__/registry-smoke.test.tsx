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
import { derivedRegistry } from '../pipeline/derived/index';
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
	// `spec` is required on SpecRegistryEntry (types/analytics.ts) and `metric`
	// is always a specRegistry key here, so read it non-optionally — matches
	// MUST_RENDER_CHART's `specRegistry[metric].spec` below.
	const spec = specRegistry[metric].spec;
	const dimensions = new Set<string>();
	if (spec.series.kind === 'groupBy') { dimensions.add(spec.series.dimension); }
	for (const dim of [spec.primaryDimension, spec.subDimension].flat()) {
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
 *  bespoke DOM and get their own dedicated real-render cases below. */
const MUST_RENDER_CHART = Object.keys(specRegistry).filter((metric) => {
	const primitive = specRegistry[metric].spec.primitive;
	return primitive === 'line' || primitive === 'stacked-area';
});

/** Records for the derived-metric no-crash tier. Derived metrics recompute
 *  from RAW source columns (their `recompute` bypasses runPipeline / the spec
 *  aggregator — see pipeline/derived/index.ts), so getSpecRequiredFields
 *  can't infer their inputs. This carries every raw column the five derived
 *  recomputes read directly:
 *    - request-rate  → path, count, period  (PerPathRateRenderer)
 *    - error-rate    → path, count, total
 *    - mqtt-traffic-{sent,received} → type, count, period  (runPipeline on the
 *      inner bytes-{sent,received} spec via TrafficByTypeRenderer)
 *    - transaction-log-growth → database, transactionLog (monotonic per node
 *      so consecutive-sample deltas are positive), id/time
 *  `count` is high so any confidence gate clears; `total` stays small so
 *  error-rate's `1 − Σtotal/Σcount` stays in-domain. */
const REQUEST_PATHS = ['GET /', 'POST /data'];
const MQTT_TYPES = ['publish', 'subscribe'];

function derivedSyntheticRecords(): AnalyticsDataPoint[] {
	const records: AnalyticsDataPoint[] = [];
	for (let bucket = 0; bucket < 6; bucket++) {
		const time = T0 + bucket * 60_000;
		for (const node of NODES) {
			for (const path of REQUEST_PATHS) {
				records.push({
					time,
					id: time,
					period: 60_000,
					node,
					path,
					type: MQTT_TYPES[bucket % MQTT_TYPES.length],
					database: 'data',
					// Cumulative counter — strictly increasing per (database, node)
					// so transaction-log-growth's delta walk yields positive rates.
					transactionLog: 1_000 * (bucket + 1),
					count: 500,
					total: 5,
					p95: 10 + bucket,
				});
			}
		}
	}
	return records;
}

/** Records that populate replication-latency's heatmap grid (dawson #1521).
 *  `node` is the DESTINATION; the SOURCE is parsed from `path`
 *  (`<source>.<db>.<table>` — see pathParser). Two sources × two destinations
 *  gives a 2×2 matrix that clears both the ≥2-rows/≥2-cols and ≤12-cells gates
 *  in ReplicationLatencyRenderer, so the real HeatmapMatrix draws instead of
 *  the single-source line fallback. `count=500` clears the confidence gate. */
function replicationHeatmapRecords(): AnalyticsDataPoint[] {
	const records: AnalyticsDataPoint[] = [];
	for (let bucket = 0; bucket < 3; bucket++) {
		const time = T0 + bucket * 60_000;
		for (const destination of NODES) {
			for (const source of NODES) {
				records.push({
					time,
					period: 60,
					node: destination,
					path: `${source}.data.tbl`,
					p95: 10 + bucket,
					count: 500,
				});
			}
		}
	}
	return records;
}

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
			// Assert the <svg> itself drew — NOT `.recharts-responsive-container`,
			// which is the wrapper div always present once a ResponsiveContainer
			// mounts (it's an ancestor of the svg, so the old
			// `.recharts-responsive-container, svg` selector matched the wrapper
			// first and never proved an svg existed). The analytics __tests__/setup.ts
			// forces an 800×600 viewport, so recharts genuinely emits svg here.
			expect(container.querySelector('svg')).not.toBeNull();
			expect(container.textContent ?? '').not.toContain('No data in window');
		});
	}
});

// ─── Derived-metric no-crash tier (kriszyp #1 — verify-derived-…) ─────────────
// MetricRenderer dispatches derivedRegistry[metric] at the TOP of its body,
// before it ever consults specRegistry, so the specRegistry-keyed loops above
// give the five derived metrics ZERO coverage. Iterate them here. Bar is
// no-crash only: derived renderers differ (custom Renderers with chip/type UI,
// per-path/per-database line series) and their populated-vs-empty shape isn't
// uniform, so we assert only that none trips the panel boundary or the
// render-failed fallback — the same guarantee the spec no-crash tier gives.
describe('derived registry smoke — every derived metric renders without tripping the panel boundary', () => {
	for (const metric of Object.keys(derivedRegistry)) {
		it(`renders derived '${metric}'`, () => {
			const { container } = render(
				<PanelErrorBoundary metric={metric}>
					<MetricRenderer
						metric={metric}
						records={derivedSyntheticRecords()}
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
});

// ─── Non-cartesian real-render tier (dawson #1521) ───────────────────────────
// heatmap (replication-latency) and small-multiples (resource-usage) dispatch
// to bespoke DOM, so the cartesian MUST_RENDER_CHART tier can't cover them.
// Give each adequate synthetic data and assert it draws its real surface — not
// its empty state — so a regression that silently drops to "No data in window"
// is caught, not just a non-crash.
describe('non-cartesian primitives render real DOM from populated records', () => {
	it('replication-latency draws the heatmap grid (not the empty/line fallback)', () => {
		const { container } = render(
			<PanelErrorBoundary metric="replication-latency">
				<MetricRenderer
					metric="replication-latency"
					records={replicationHeatmapRecords()}
					window={WINDOW}
					nodes={NODES}
				/>
			</PanelErrorBoundary>,
		);
		const grid = container.querySelector('[role="grid"]');
		expect(grid).not.toBeNull();
		// A real 2×2 matrix emits gridcells — the empty state renders none.
		expect(grid?.querySelectorAll('[role="gridcell"]').length ?? 0).toBeGreaterThan(0);
		expect(container.textContent ?? '').not.toContain('No data in window');
	});

	it('resource-usage draws multiple small-multiple sub-charts', () => {
		const { container } = render(
			<PanelErrorBoundary metric="resource-usage">
				<MetricRenderer
					metric="resource-usage"
					records={syntheticRecords('resource-usage')}
					window={WINDOW}
					nodes={NODES}
				/>
			</PanelErrorBoundary>,
		);
		// One titled sub-panel + one svg per resource-usage field (4 fields).
		expect(container.querySelectorAll('[data-testid="small-multiple-title"]').length).toBeGreaterThan(1);
		expect(container.querySelectorAll('svg').length).toBeGreaterThan(1);
	});
});
