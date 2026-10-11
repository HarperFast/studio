import type { badgeVariants } from '@/components/ui/badgeVariants';
import type { VariantProps } from 'class-variance-authority';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STATUS_DISPLAY: Record<string, { label: string; variant: BadgeVariant }> = {
	CREATED: { label: 'Queued', variant: 'secondary' },
	IN_PROGRESS: { label: 'Running', variant: 'default' },
	COMPLETE: { label: 'Complete', variant: 'success' },
	ERROR: { label: 'Failed', variant: 'destructive' },
};

export function describeJobStatus(status: string | undefined): { label: string; variant: BadgeVariant } {
	const known = status ? STATUS_DISPLAY[status.toUpperCase()] : undefined;
	return known ?? { label: status || 'Unknown', variant: 'outline' };
}

function isJobFinished(status: string | undefined): boolean {
	const normalized = status?.toUpperCase();
	return normalized === 'COMPLETE' || normalized === 'ERROR';
}

export function jobDurationMs(
	job: { status?: string; start_datetime?: number; end_datetime?: number },
): number | undefined {
	if (!isJobFinished(job.status) || typeof job.start_datetime !== 'number' || typeof job.end_datetime !== 'number') {
		return undefined;
	}
	return job.end_datetime - job.start_datetime;
}

export function formatJobTime(ms: number | undefined): string {
	return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toLocaleString() : '—';
}
