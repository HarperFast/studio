import type { Instance } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { cloneProgressOf, describeCloneProgress, describeSyncSummary } from './cloneProgress';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function instance(fields: Partial<Instance>): Instance {
	return { id: 'ins-1', instanceFqdn: 'a.example.com', operationsApiPort: 9925, ...fields } as Instance;
}

describe('cloneProgressOf', () => {
	it('is null outside a clone status, even with clone fields left on the instance', () => {
		const leftover = { cloneExpectedGb: 40, cloneProgressGb: 40, cloneStartedAt: minutesAgo(90) };
		expect(cloneProgressOf(instance({ status: 'RUNNING', ...leftover }))).toBeNull();
		expect(cloneProgressOf(instance({ status: 'PROVISIONING', ...leftover }))).toBeNull();
		expect(cloneProgressOf(instance({ status: undefined, ...leftover }))).toBeNull();
	});

	it('reports CLONE_PENDING as waiting, ignoring any figures', () => {
		expect(cloneProgressOf(instance({ status: 'CLONE_PENDING', cloneExpectedGb: 40, cloneProgressGb: 12 })))
			.toEqual({ waiting: true, copiedGb: 0 });
	});

	it('measures copied against expected while cloning', () => {
		const progress = cloneProgressOf(instance({
			status: 'CLONING',
			cloneExpectedGb: 40,
			cloneProgressGb: 12.4,
			cloneStartedAt: minutesAgo(10),
			cloneProgressAt: minutesAgo(2),
		}));
		expect(progress).toMatchObject({ waiting: false, copiedGb: 12.4, expectedGb: 40 });
		expect(progress?.ratio).toBeCloseTo(0.31);
		expect(progress?.lastProgressAt).toBe(NOW - 2 * 60_000);
		expect(progress?.startedAt).toBe(NOW - 10 * 60_000);
	});

	it('clamps a ratio past 100%: copied is whole-disk usage, expected is the source at the start', () => {
		expect(cloneProgressOf(instance({ status: 'CLONING', cloneExpectedGb: 40, cloneProgressGb: 41.2 }))?.ratio)
			.toBe(1);
	});

	it('has no ratio without a positive expected size', () => {
		for (const cloneExpectedGb of [undefined, 0, -1]) {
			const progress = cloneProgressOf(instance({ status: 'CLONE_READY', cloneExpectedGb, cloneProgressGb: 0 }));
			expect(progress).toMatchObject({ waiting: false, copiedGb: 0, expectedGb: undefined, ratio: undefined });
		}
	});

	it('treats missing or unparseable times as absent', () => {
		const progress = cloneProgressOf(instance({ status: 'CLONING', cloneProgressAt: 'not a date' }));
		expect(progress?.lastProgressAt).toBeUndefined();
		expect(progress?.startedAt).toBeUndefined();
	});
});

describe('describeCloneProgress', () => {
	it('shows copied of expected, percent and time since last progress', () => {
		const progress = cloneProgressOf(instance({
			status: 'CLONING',
			cloneExpectedGb: 40,
			cloneProgressGb: 12.437,
			cloneStartedAt: minutesAgo(10),
			cloneProgressAt: minutesAgo(2),
		}))!;
		expect(describeCloneProgress(progress, NOW)).toBe(
			'Syncing data · ~12.4 of ~40 GB (31%) · last progress 2 minutes ago',
		);
	});

	it('rounds the percent down so a near-complete copy does not read as 100%', () => {
		const progress = cloneProgressOf(instance({ status: 'CLONING', cloneExpectedGb: 40, cloneProgressGb: 39.9 }))!;
		expect(describeCloneProgress(progress, NOW)).toBe('Syncing data · ~39.9 of ~40 GB (99%)');
	});

	it('shows only the copied amount without an expected size', () => {
		const progress = cloneProgressOf(instance({ status: 'CLONING', cloneProgressGb: 12.4 }))!;
		expect(describeCloneProgress(progress, NOW)).toBe('Syncing data · ~12.4 GB copied');
	});

	it('falls back to the start time before the first progress report', () => {
		const progress = cloneProgressOf(instance({
			status: 'CLONE_READY',
			cloneExpectedGb: 40,
			cloneProgressGb: 0,
			cloneStartedAt: minutesAgo(5),
		}))!;
		expect(describeCloneProgress(progress, NOW)).toBe('Syncing data · ~0 of ~40 GB (0%) · started 5 minutes ago');
	});

	it('says a pending clone is waiting', () => {
		expect(describeCloneProgress(cloneProgressOf(instance({ status: 'CLONE_PENDING' }))!, NOW))
			.toBe('Waiting to sync data');
	});
});

describe('describeSyncSummary', () => {
	it('shows the count and a floored percent when both sizes are present', () => {
		expect(describeSyncSummary({ syncing: 2, copiedGb: 12.4, expectedGb: 40 })).toBe('Syncing 2 · ~31%');
		expect(describeSyncSummary({ syncing: 1, copiedGb: 39.9, expectedGb: 40 })).toBe('Syncing 1 · ~99%');
	});

	it('clamps a copy past its expected size to 100%', () => {
		expect(describeSyncSummary({ syncing: 1, copiedGb: 41, expectedGb: 40 })).toBe('Syncing 1 · ~100%');
	});

	it('shows only the count without both sizes', () => {
		expect(describeSyncSummary({ syncing: 3 })).toBe('Syncing 3');
		expect(describeSyncSummary({ syncing: 3, copiedGb: 5 })).toBe('Syncing 3');
		expect(describeSyncSummary({ syncing: 3, copiedGb: 5, expectedGb: 0 })).toBe('Syncing 3');
	});

	it('is null when nothing is syncing or central manager sent no summary', () => {
		expect(describeSyncSummary(undefined)).toBeNull();
		expect(describeSyncSummary(null)).toBeNull();
		expect(describeSyncSummary({ syncing: 0 })).toBeNull();
	});
});
