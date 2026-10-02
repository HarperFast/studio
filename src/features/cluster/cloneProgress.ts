import { isCloning } from '@/components/ui/utils/badgeStatus';
import type { ClusterSyncSummary, Instance } from '@/integrations/api/api.patch';
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

/** Null outside a clone status: central manager leaves the clone fields on the row after RUNNING. */
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

export function describeSyncSummary(summary: ClusterSyncSummary | null | undefined): string | null {
	if (!summary || !(summary.syncing > 0)) {
		return null;
	}
	const { copiedGb, expectedGb } = summary;
	return copiedGb !== undefined && expectedGb !== undefined && expectedGb > 0
		? `Syncing ${summary.syncing} · ~${clonePercent(Math.min(1, Math.max(0, copiedGb) / expectedGb))}%`
		: `Syncing ${summary.syncing}`;
}

export function clonePercent(ratio: number): number {
	return Math.floor(ratio * 100);
}

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
