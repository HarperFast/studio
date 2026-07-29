import { describe, expect, it } from 'vitest';
import {
	buildStalenessHorizons,
	estimateEmissionIntervalMs,
	isGaugeCrossNodeSum,
	STALENESS_INTERVALS,
} from '../../pipeline/carryForward';

describe('isGaugeCrossNodeSum', () => {
	it('accepts the two gauge shapes that ship (max/sum, last/sum)', () => {
		expect(isGaugeCrossNodeSum('max', 'sum')).toBe(true); // connections
		expect(isGaugeCrossNodeSum('last', 'sum')).toBe(true); // database-size
	});

	it('rejects additive counters — a missing row there really is zero', () => {
		// mqtt-traffic-*, bytes-sent/received, fsWrite: carrying the previous
		// bucket's throughput forward would invent traffic that never happened.
		expect(isGaugeCrossNodeSum('sum', 'sum')).toBe(false);
	});

	it('rejects every crossNode aggregator other than sum', () => {
		// max/mean/CWM across nodes already degrade gracefully when a node is
		// absent — they don't understate the way a partial sum does.
		for (const cross of ['max', 'min', 'mean', 'last', 'p95', 'count-weighted-mean'] as const) {
			expect(isGaugeCrossNodeSum('max', cross), `max/${cross}`).toBe(false);
			expect(isGaugeCrossNodeSum('last', cross), `last/${cross}`).toBe(false);
		}
	});

	it('rejects mean/p95 temporal aggregators paired with a cross-node sum', () => {
		for (const temporal of ['mean', 'p50', 'p95', 'p99', 'count-weighted-mean', 'min'] as const) {
			expect(isGaugeCrossNodeSum(temporal, 'sum'), `${temporal}/sum`).toBe(false);
		}
	});
});

describe('estimateEmissionIntervalMs', () => {
	it('returns the interval for an evenly spaced series', () => {
		expect(estimateEmissionIntervalMs([0, 90_000, 180_000, 270_000])).toBe(90_000);
	});

	it('is order-independent', () => {
		expect(estimateEmissionIntervalMs([270_000, 0, 180_000, 90_000])).toBe(90_000);
	});

	it('averages the two middle gaps on an even gap count', () => {
		// gaps: 60_000, 120_000 → (60_000 + 120_000) / 2
		expect(estimateEmissionIntervalMs([0, 60_000, 180_000])).toBe(90_000);
	});

	it('ignores zero-length gaps from duplicate instants', () => {
		// Harper registers mqtt-connections with `byThread: true`; a build that
		// forwards per-thread rows unaggregated yields several rows per instant.
		expect(estimateEmissionIntervalMs([0, 0, 0, 90_000, 90_000, 180_000])).toBe(90_000);
	});

	it('uses the median so scattered absences do not inflate the estimate', () => {
		// A node whose count keeps crossing zero (core's `> 0` guard) emits in
		// bursts. Its active cadence is 90 s; the mean of these gaps is 234 s,
		// the median is still 90 s.
		const times = [0, 90_000, 180_000, 900_000, 990_000, 1_080_000, 1_800_000];
		expect(estimateEmissionIntervalMs(times)).toBe(90_000);
	});

	it('returns null when there is no gap to measure', () => {
		expect(estimateEmissionIntervalMs([])).toBeNull();
		expect(estimateEmissionIntervalMs([1_000])).toBeNull();
		expect(estimateEmissionIntervalMs([1_000, 1_000])).toBeNull();
	});
});

describe('buildStalenessHorizons', () => {
	const FLOOR = 60_000;

	it('scales each node by its own observed cadence', () => {
		const horizons = buildStalenessHorizons(
			new Map([
				['fast', [0, 90_000, 180_000]],
				['slow', [0, 600_000, 1_200_000]],
			]),
			FLOOR,
		);
		expect(horizons.get('fast')).toBe(STALENESS_INTERVALS * 90_000);
		expect(horizons.get('slow')).toBe(STALENESS_INTERVALS * 600_000);
	});

	it('floors at the bucket size so the horizon always spans two buckets', () => {
		// A node emitting faster than the bucket lattice still needs a horizon
		// wide enough to absorb the phase drift the lattice introduces.
		const horizons = buildStalenessHorizons(new Map([['n1', [0, 10_000, 20_000]]]), FLOOR);
		expect(horizons.get('n1')).toBe(STALENESS_INTERVALS * FLOOR);
	});

	it('falls back to the bucket size for a node seen exactly once', () => {
		const horizons = buildStalenessHorizons(new Map([['n1', [12_345]]]), FLOOR);
		expect(horizons.get('n1')).toBe(STALENESS_INTERVALS * FLOOR);
	});

	it('emits no entry for a node it never saw', () => {
		const horizons = buildStalenessHorizons(new Map([['n1', [0, 60_000]]]), FLOOR);
		expect(horizons.has('n2')).toBe(false);
	});
});
