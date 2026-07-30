import { describe, expect, it } from 'vitest';
import {
	buildStalenessHorizons,
	estimateEmissionIntervalMs,
	isGaugeCrossNodeSum,
	MAX_STALENESS_MS,
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
				// 10-minute cadence: 2 x that would be 20 min, so the cap binds.
				['slow', [0, 600_000, 1_200_000]],
			]),
			FLOOR,
		);
		expect(horizons.get('fast')).toBe(STALENESS_INTERVALS * 90_000);
		expect(horizons.get('slow')).toBe(MAX_STALENESS_MS);
	});

	it('caps a node observed only twice, far apart, instead of trusting the gap', () => {
		// The shape kriszyp flagged: observations at 00:00 and 12:00 read as a
		// 12-hour "cadence", which uncapped meant a 24-hour horizon — the node's
		// stale count would then be summed into every later bucket for the rest
		// of the window, hiding a real drop to zero.
		const HOUR = 3_600_000;
		const horizons = buildStalenessHorizons(new Map([['quiet', [0, 12 * HOUR]]]), FLOOR);
		expect(horizons.get('quiet')).toBe(MAX_STALENESS_MS);
		expect(horizons.get('quiet')).toBeLessThan(STALENESS_INTERVALS * 12 * HOUR);
	});

	it('caps when one normal gap and one outage average into a multi-hour median', () => {
		// Three samples, gaps [60 s, 6 h] → median 3h0m30s. Also the reviewer's
		// second scenario, and the median offers no protection here.
		const horizons = buildStalenessHorizons(new Map([['n1', [0, 60_000, 60_000 + 6 * 3_600_000]]]), FLOOR);
		expect(horizons.get('n1')).toBe(MAX_STALENESS_MS);
	});

	it('lets the bucket floor exceed the cap, so ≥2 buckets still holds', () => {
		// On a spec whose own bucket is coarser than the 5-minute backstop,
		// spanning two buckets matters more than the backstop — the floor is
		// applied after the cap for exactly this case.
		const coarseFloor = 4 * 3_600_000; // 4h buckets
		const horizons = buildStalenessHorizons(new Map([['n1', [0, 12 * 3_600_000]]]), coarseFloor);
		expect(horizons.get('n1')).toBe(STALENESS_INTERVALS * coarseFloor);
	});

	it('never exceeds max(MAX_STALENESS_MS, 2 x floor) for any observation shape', () => {
		const shapes: number[][] = [
			[0, 90_000],
			[0, 12 * 3_600_000],
			[0, 1_000, 30 * 24 * 3_600_000],
			[5],
			[0, 0, 0],
			[0, 60_000, 120_000, 30 * 24 * 3_600_000],
		];
		for (const floor of [1_000, FLOOR, 600_000]) {
			const ceiling = Math.max(MAX_STALENESS_MS, STALENESS_INTERVALS * floor);
			for (const [i, times] of shapes.entries()) {
				const h = buildStalenessHorizons(new Map([['n', times]]), floor).get('n')!;
				expect(h, `shape ${i} @ floor ${floor}`).toBeLessThanOrEqual(ceiling);
			}
		}
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
