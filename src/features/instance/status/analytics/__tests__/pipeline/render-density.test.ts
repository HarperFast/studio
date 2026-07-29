// Chart point density per time preset.
//
// Studio asks Harper for `bucket_ms` sized to the selected window, but builds
// that ignore the hint (harper-pro 5.1.22) return rows at raw emission cadence.
// The pipeline then buckets on `spec.bucket.fallbackMs` — 60 s no matter how
// wide the window — so a 30 d view rendered 43 200 points per series instead of
// the 720 its preset asks for. `downsampleToWindow` folds the finished series
// onto the preset's lattice.
import { describe, expect, it } from 'vitest';
import { getPreset, targetBucketMs, TIME_PRESETS } from '../../context/timePresets';
import { runPipeline } from '../../pipeline/pipeline';
import { wrapperMetrics } from '../../pipeline/wrapperMetrics';
import type { AnalyticsDataPoint, TimeRange } from '../../types/analytics';

const connectionsSpec = wrapperMetrics['connections'].spec;
const bytesSentSpec = wrapperMetrics['bytes-sent'].spec;

/** Observed emission cadence on the reporting instance — not a divisor of the
 *  60 s fallback lattice, which is what made the counts ragged. */
const CADENCE = 90_000;
const T0 = 28_333_334 * 60_000;

const windowFor = (durationMs: number): TimeRange => ({ startTime: T0, endTime: T0 + durationMs });

/** Two nodes reporting a steady gauge for `durationMs`, `period: 0`. */
function gaugeRows(durationMs: number): AnalyticsDataPoint[] {
	const rows: AnalyticsDataPoint[] = [];
	for (let t = 0; t < durationMs; t += CADENCE) {
		rows.push({ type: 'mqtt', node: 'a', time: T0 + t, connections: 100, count: 1, period: 0 });
		rows.push({ type: 'mqtt', node: 'b', time: T0 + t + CADENCE / 2, connections: 100, count: 1, period: 0 });
	}
	return rows;
}

const mqttPoints = (rows: AnalyticsDataPoint[], w: TimeRange, downsample: boolean) =>
	runPipeline(connectionsSpec, rows, w, [], { snapToPeriod: true, downsampleToWindow: downsample })
		.series.find((s) => s.key === 'mqtt')!.points;

describe('targetBucketMs', () => {
	it('resolves every preset-sized window to exactly that preset bucketMs', () => {
		// Load-bearing: StorageTab aligns its trend grid to the context bucketMs
		// (#1514). If these two ever disagree, crosshair sync silently breaks.
		for (const p of TIME_PRESETS) {
			expect(targetBucketMs(p.durationMs), p.id).toBe(p.bucketMs);
		}
	});

	it('tolerates the sub-second drift of a live now() end bound', () => {
		const p = getPreset('24h');
		expect(targetBucketMs(p.durationMs + 400)).toBe(p.bucketMs);
		expect(targetBucketMs(p.durationMs - 400)).toBe(p.bucketMs);
	});

	it('falls to the finest bucket for a degenerate window', () => {
		const finest = TIME_PRESETS[0].bucketMs;
		expect(targetBucketMs(0)).toBe(finest);
		expect(targetBucketMs(-1)).toBe(finest);
		expect(targetBucketMs(Number.NaN)).toBe(finest);
	});

	it('holds the widest preset ratio beyond 30d instead of reverting to 60s', () => {
		const widest = TIME_PRESETS[TIME_PRESETS.length - 1];
		const ratio = widest.durationMs / widest.bucketMs;
		const twice = widest.durationMs * 2;
		expect(targetBucketMs(twice)).toBe(Math.ceil(twice / ratio));
		// A 285-century sentinel window must not silently produce a 60s lattice.
		expect(targetBucketMs(Number.MAX_SAFE_INTEGER)).toBeGreaterThan(widest.bucketMs);
	});
});

describe('rendered point count per preset', () => {
	for (const preset of TIME_PRESETS) {
		it(`${preset.id}: folds to the preset's own resolution`, () => {
			const rows = gaugeRows(preset.durationMs);
			const w = windowFor(preset.durationMs);
			const intended = Math.round(preset.durationMs / preset.bucketMs);

			const before = mqttPoints(rows, w, false);
			const after = mqttPoints(rows, w, true);

			// Never coarser than asked, and within one bucket of the target.
			expect(after.length).toBeLessThanOrEqual(intended + 1);
			expect(after.length).toBeLessThanOrEqual(before.length);
			// The wide presets are the ones that were over-dense; the 1h/6h
			// presets already sit on their own lattice and must come through
			// unchanged. (Value equality, not reference — these are two separate
			// runPipeline calls, so the arrays are distinct instances either way.)
			if (preset.bucketMs > 60_000) {
				expect(before.length).toBeGreaterThan(intended * 2);
			} else {
				expect(after).toEqual(before);
			}
		});
	}

	it('30d drops from ~43k points to ~720', () => {
		const preset = getPreset('30d');
		const rows = gaugeRows(preset.durationMs);
		const w = windowFor(preset.durationMs);
		expect(mqttPoints(rows, w, false).length).toBeGreaterThan(40_000);
		expect(mqttPoints(rows, w, true).length).toBeLessThanOrEqual(721);
	});
});

describe('gauge values survive the fold', () => {
	it('keeps the cluster total, not a fraction of it', () => {
		// connections is max/sum with the #1576 carry-forward; folding must not
		// reintroduce a dip. Both nodes hold 100, so the total is 200 throughout.
		const preset = getPreset('7d');
		const points = mqttPoints(gaugeRows(preset.durationMs), windowFor(preset.durationMs), true);
		for (const p of points) {
			expect(p.y, `bucket ${p.x}`).toBe(200);
		}
	});
});

describe('rate-transformed counters are NOT inflated', () => {
	// The regression this design exists to avoid. bytes-sent is temporal 'sum'
	// over a `rate`-transformed field: widening the *record* bucketing would sum
	// per-second rates from different periods (measured 1000 B/s -> 3000 B/s on a
	// 5 min lattice, and 60x at 30 d). Folding after aggregation must not.
	const rateRows = (durationMs: number): AnalyticsDataPoint[] => {
		const rows: AnalyticsDataPoint[] = [];
		for (let t = 0; t < durationMs; t += CADENCE) {
			// count x mean = 60_000 bytes over a 60 s period => 1000 B/s.
			rows.push({ type: 'egress', node: 'a', time: T0 + t, count: 1, mean: 60_000, period: 60_000 });
		}
		return rows;
	};

	const egressPoints = (durationMs: number, downsample: boolean) =>
		runPipeline(bytesSentSpec, rateRows(durationMs), windowFor(durationMs), [], {
			snapToPeriod: true,
			downsampleToWindow: downsample,
		}).series.find((s) => s.key === 'egress')!.points;

	for (const id of ['24h', '7d', '30d'] as const) {
		it(`${id}: every bucket still reads 1000 B/s`, () => {
			const preset = getPreset(id);
			const points = egressPoints(preset.durationMs, true);
			expect(points.length).toBeGreaterThan(0);
			for (const p of points) {
				expect(p.y, `bucket ${p.x}`).toBeCloseTo(1000, 6);
			}
		});
	}

	it('24h: fold reduces the point count without moving the value', () => {
		const preset = getPreset('24h');
		const before = egressPoints(preset.durationMs, false);
		const after = egressPoints(preset.durationMs, true);
		// One node at 90 s over 24 h is 960 snapped points; the 5 min preset asks
		// for 288 (+1 for the inclusive end bound).
		expect(before.length).toBeGreaterThan(900);
		expect(after.length).toBeLessThanOrEqual(289);
		expect(before.every((p) => Math.abs((p.y ?? 0) - 1000) < 1e-6)).toBe(true);
		expect(after.every((p) => Math.abs((p.y ?? 0) - 1000) < 1e-6)).toBe(true);
	});
});

describe('opting out keeps full resolution', () => {
	it('omitting downsampleToWindow leaves the series untouched (KPI tile path)', () => {
		const preset = getPreset('30d');
		const rows = gaugeRows(preset.durationMs);
		const w = windowFor(preset.durationMs);
		expect(mqttPoints(rows, w, false).length).toBeGreaterThan(40_000);
	});
});
