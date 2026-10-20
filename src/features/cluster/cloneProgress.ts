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
	return summary.progress !== undefined && Number.isFinite(summary.progress)
		? `Syncing · ~${clonePercent(Math.min(1, Math.max(0, summary.progress)))}%`
		: 'Syncing';
}

export function clonePercent(ratio: number): number {
	return Math.floor(ratio * 100);
}

export function describeCloneProgress(progress: CloneProgress, now: number): string {
	if (progress.waiting) {
		return 'Waiting to sync data';
	}
	const age = progress.lastProgressAt !== undefined
		? `last progress ${ago(progress.lastProgressAt, now)}`
		: progress.startedAt !== undefined
		? `started ${ago(progress.startedAt, now)}`
		: undefined;
	return ['Syncing data', describeAmount(progress), age].filter(Boolean).join(' · ');
}

function describeAmount({ copiedGb, expectedGb, ratio }: CloneProgress): string | undefined {
	const copied = sizeOf(copiedGb);
	if (!copied) {
		return undefined;
	}
	const expected = expectedGb === undefined ? undefined : sizeOf(expectedGb);
	if (!expected || ratio === undefined) {
		return `~${copied.value} ${copied.unit} copied`;
	}
	const copiedLabel = copied.unit === expected.unit ? copied.value : `${copied.value} ${copied.unit}`;
	return `~${copiedLabel} of ~${expected.value} ${expected.unit} (${clonePercent(ratio)}%)`;
}

/** Host manager reports base-10 GB. */
const MB_PER_GB = 1000;
const gbFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const mbFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function sizeOf(gb: number): { value: string; unit: 'MB' | 'GB' } | undefined {
	const mb = Math.round(gb * MB_PER_GB);
	if (!(mb > 0)) {
		return undefined;
	}
	return mb < MB_PER_GB ? { value: mbFormat.format(mb), unit: 'MB' } : { value: gbFormat.format(gb), unit: 'GB' };
}

function ago(timeMs: number, now: number): string {
	return translateSecondsToAgo(Math.max(0, Math.round((now - timeMs) / 1000)), timeMs);
}

function toTime(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : undefined;
}
