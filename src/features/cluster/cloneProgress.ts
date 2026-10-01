import { isCloning } from '@/components/ui/utils/badgeStatus';
import type { Instance } from '@/integrations/api/api.patch';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

type CloneFields = Pick<
	Instance,
	'status' | 'cloneExpectedGb' | 'cloneProgressGb' | 'cloneProgressAt' | 'cloneStartedAt'
>;

export interface CloneProgress {
	/** CLONE_PENDING: the copy hasn't started, and central manager stamps the figures only once it does. */
	waiting: boolean;
	copiedGb: number;
	expectedGb?: number;
	/** Clamped to [0, 1]. Undefined when there is no expected size to measure against. */
	ratio?: number;
	lastProgressAt?: number;
	startedAt?: number;
}

/**
 * Data-sync progress for an instance in a clone status, else null. Central manager leaves the clone fields on the
 * instance after it reaches RUNNING, so they mean nothing outside a clone status.
 *
 * Both sizes are approximate: "copied" is the new instance's whole-disk usage and "expected" is the source's usage
 * when the copy started, so the raw ratio can pass 1 or plateau below it while the copy finalizes.
 */
export function cloneProgressOf(instance: CloneFields): CloneProgress | null {
	if (!isCloning(instance.status)) {
		return null;
	}
	if (instance.status === 'CLONE_PENDING') {
		return { waiting: true, copiedGb: 0 };
	}
	const copiedGb = Math.max(0, instance.cloneProgressGb ?? 0);
	const expectedGb = instance.cloneExpectedGb && instance.cloneExpectedGb > 0 ? instance.cloneExpectedGb : undefined;
	return {
		waiting: false,
		copiedGb,
		expectedGb,
		ratio: expectedGb === undefined ? undefined : Math.min(1, copiedGb / expectedGb),
		lastProgressAt: toTime(instance.cloneProgressAt),
		startedAt: toTime(instance.cloneStartedAt),
	};
}

/** Share of the expected data copied across the cloning instances that have an expected size, or null if none do. */
export function aggregateCloneRatio(instances: readonly CloneFields[]): number | null {
	let copiedGb = 0;
	let expectedGb = 0;
	for (const instance of instances) {
		const progress = cloneProgressOf(instance);
		if (progress?.expectedGb === undefined) {
			continue;
		}
		copiedGb += Math.min(progress.copiedGb, progress.expectedGb);
		expectedGb += progress.expectedGb;
	}
	return expectedGb > 0 ? copiedGb / expectedGb : null;
}

export function clonePercent(ratio: number): number {
	return Math.floor(ratio * 100);
}

/** e.g. "Syncing data · ~12.4 of ~40 GB (31%) · last progress 2 minutes ago". */
export function describeCloneProgress(progress: CloneProgress, now: number): string {
	if (progress.waiting) {
		return 'Waiting to sync data';
	}
	const amount = progress.expectedGb === undefined || progress.ratio === undefined
		? `~${formatGb(progress.copiedGb)} GB copied`
		: `~${formatGb(progress.copiedGb)} of ~${formatGb(progress.expectedGb)} GB (${clonePercent(progress.ratio)}%)`;
	const age = progress.lastProgressAt !== undefined
		? `last progress ${ago(progress.lastProgressAt, now)}`
		: progress.startedAt !== undefined
		? `started ${ago(progress.startedAt, now)}`
		: undefined;
	return ['Syncing data', amount, age].filter(Boolean).join(' · ');
}

function formatGb(gb: number): string {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(gb);
}

function ago(timeMs: number, now: number): string {
	return translateSecondsToAgo(Math.round((now - timeMs) / 1000), timeMs);
}

function toTime(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : undefined;
}
