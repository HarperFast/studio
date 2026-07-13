import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bytesSentSpec } from '../../pipeline/bytes-sent';
import { mqttTrafficSentDerived } from '../../pipeline/derived/mqtt-traffic-sent';
import { runPipeline } from '../../pipeline/pipeline';

describe('bytes-sent tolerance', () => {
	it('total bytes/sec ≈ Σ type-rates within 0.5% (global sum)', () => {
		const records = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/bytes/bytes-sent.json'), 'utf8'));
		const out = runPipeline(bytesSentSpec, records, { startTime: 0, endTime: Number.MAX_SAFE_INTEGER }, []);

		const refTotal = records.reduce((s: number, r: any) => {
			if (
				typeof r.count !== 'number' || typeof r.mean !== 'number' || typeof r.period !== 'number' || r.period <= 0
			) { return s; }
			return s + (r.count * r.mean / r.period) * 1000;
		}, 0);

		const seriesTotal = out.series.reduce((s, series) => {
			return s + series.points.reduce((ss, p) => ss + (typeof p.y === 'number' ? p.y : 0), 0);
		}, 0);

		const diff = Math.abs(seriesTotal - refTotal);
		const tolerance = refTotal * 0.005;
		expect(diff <= tolerance, `Σ type-rates ${seriesTotal} differs from total ${refTotal} by ${diff} (>0.5%)`)
			.toBeTruthy();
	});

	it('per-bucket Σ series.y === refTotal(t) within 1e-9 (epsilon — identical formulas)', () => {
		const records = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/bytes/bytes-sent.json'), 'utf8'));
		const out = runPipeline(bytesSentSpec, records, { startTime: 0, endTime: Number.MAX_SAFE_INTEGER }, []);

		const refByTime = new Map<number, number>();
		for (const r of records as any[]) {
			if (r.period <= 0) { continue; }
			const v = (r.count * r.mean / r.period) * 1000;
			refByTime.set(r.time, (refByTime.get(r.time) ?? 0) + v);
		}

		const seriesByTime = new Map<number, number>();
		for (const series of out.series) {
			for (const p of series.points) {
				if (typeof p.y !== 'number') { continue; }
				seriesByTime.set(p.x, (seriesByTime.get(p.x) ?? 0) + p.y);
			}
		}

		for (const [t, ref] of refByTime) {
			const sum = seriesByTime.get(t) ?? 0;
			const diff = Math.abs(sum - ref);
			// Identical formulas (count×mean/period×1000) on both sides; tolerance is float epsilon.
			expect(diff <= Math.max(1e-9, ref * 1e-9), `Bucket t=${t}: Σ=${sum} vs ref=${ref}, diff=${diff} > epsilon`)
				.toBeTruthy();
		}
	});

	it('mqtt-traffic-sent (msg/sec) total ≈ Σ count/period × 1000 within 0.5%', () => {
		const records = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/bytes/bytes-sent.json'), 'utf8'));
		const out = mqttTrafficSentDerived.recompute(records, { startTime: 0, endTime: Number.MAX_SAFE_INTEGER }, []);

		const refTotal = records.reduce((s: number, r: any) => {
			if (typeof r.count !== 'number' || typeof r.period !== 'number' || r.period <= 0) { return s; }
			return s + (r.count / r.period) * 1000;
		}, 0);

		const seriesTotal = out.series.reduce((s, series) => {
			return s + series.points.reduce((ss, p) => ss + (typeof p.y === 'number' ? p.y : 0), 0);
		}, 0);

		const diff = Math.abs(seriesTotal - refTotal);
		expect(diff <= refTotal * 0.005, `Σ msg/sec ${seriesTotal} differs from ${refTotal} by ${diff} (>0.5%)`)
			.toBeTruthy();
	});
});
