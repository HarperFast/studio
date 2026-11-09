import { Button } from '@/components/ui/button';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { backupJobQueryOptions, backupJobStatus, createdBackupId } from '@/integrations/api/instance/backups/backups';
import { HarperJob, JOB_NOT_FOUND_GRACE_MS } from '@/integrations/api/instance/database/getJob';
import { errorText } from '@/lib/errorText';
import { isForbiddenError } from '@/react-query/pollUnlessForbidden';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

export interface FollowedBackupJob {
	jobId: string;
	database: string;
	kind: 'create' | 'verify';
	backupId?: number;
	/** When the verified backup was taken: Harper reuses an id once every backup is gone, so the id alone is ambiguous. */
	backupTimestamp?: number;
	verifyChecksum?: boolean;
	startedAt: number;
	outcome?: BackupJobOutcome;
}

/** `missing` and `forbidden` are Studio giving up on reading the job: its outcome is unknown, not a failure. */
export type BackupJobOutcome = 'complete' | 'failed' | 'missing' | 'forbidden';

function describeRunning(job: FollowedBackupJob): string {
	return job.kind === 'create'
		? `Backing up '${job.database}'`
		: `Verifying backup ${job.backupId} of '${job.database}'${job.verifyChecksum ? ', checksums included' : ''}`;
}

function describeComplete(job: FollowedBackupJob, record: HarperJob | null | undefined): string {
	if (job.kind === 'verify') {
		return `Backup ${job.backupId} of '${job.database}' verified${job.verifyChecksum ? ', checksums included' : ''}.`;
	}
	const backupId = createdBackupId(record);
	return backupId === undefined
		? `Backed up '${job.database}'.`
		: `Backed up '${job.database}' as backup ${backupId}.`;
}

function describeFailed(job: FollowedBackupJob, record: HarperJob | null | undefined): string {
	const reason = errorText(record?.message) ?? 'Harper gave no reason.';
	return job.kind === 'create'
		? `Backing up '${job.database}' failed: ${reason}`
		: `Backup ${job.backupId} of '${job.database}' failed verification: ${reason}`;
}

/**
 * One job's progress. Harper reports a backup job only as created, in progress, or ended, so "running" is all
 * there is to show until it ends. `onSettled` fires once, when the job ends or Studio stops looking for it.
 */
export function BackupJobLine({ job, nodeParams, onSettled, onDismiss }: {
	job: FollowedBackupJob;
	nodeParams: InstanceClientIdConfig;
	onSettled: (outcome: BackupJobOutcome, record: HarperJob | null | undefined) => void;
	onDismiss: () => void;
}) {
	const { data: record, error, dataUpdatedAt } = useQuery({
		...backupJobQueryOptions({ ...nodeParams, jobId: job.jobId }),
		enabled: job.outcome === undefined,
	});
	const status = backupJobStatus(record ?? undefined);
	// A missing row only counts once it has stayed missing: the first read can race the job's own write.
	const [missingSince, setMissingSince] = useState<number>();
	useEffect(() => {
		if (record === null) {
			setMissingSince((since) => since ?? dataUpdatedAt);
		} else if (record) {
			setMissingSince(undefined);
		}
	}, [record, dataUpdatedAt]);
	// `record === null` too: `missingSince` is cleared by an effect, after this render has already used it.
	const missing = record === null && missingSince !== undefined
		&& dataUpdatedAt - missingSince >= JOB_NOT_FOUND_GRACE_MS;
	// A 403 stops the poll for good (pollUnlessForbidden), so it ends the follow rather than holding the node's writes.
	const derived: BackupJobOutcome | undefined = isForbiddenError(error)
		? 'forbidden'
		: missing
		? 'missing'
		: status === 'running'
		? undefined
		: status;

	const settled = useRef(job.outcome !== undefined);
	const reportSettled = useEffectEvent(onSettled);
	useEffect(() => {
		if (settled.current) {
			return;
		}
		if (derived) {
			settled.current = true;
			reportSettled(derived, record);
		}
	}, [derived, record]);

	const outcome = job.outcome ?? derived;
	let icon = <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />;
	let text = `${describeRunning(job)}… started ${new Date(job.startedAt).toLocaleTimeString()}.`;
	if (outcome === 'complete') {
		icon = <CircleCheckIcon className="size-4 shrink-0 text-green" aria-hidden />;
		text = describeComplete(job, record);
	} else if (outcome === 'failed') {
		icon = <CircleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden />;
		text = describeFailed(job, record);
	} else if (outcome === 'missing' || outcome === 'forbidden') {
		icon = <CircleAlertIcon className="size-4 shrink-0 text-amber-500" aria-hidden />;
		const why = outcome === 'missing'
			? `Studio can't find job ${job.jobId} on this node`
			: `Studio is no longer allowed to read job ${job.jobId} on this node`;
		text = `${describeRunning(job)}: ${why}, so it can't tell how it ended. `
			+ (job.kind === 'create' ? 'Refresh the list to see whether the backup was taken.' : 'Verify the backup again.');
	} else if (error) {
		text += ` Studio couldn't check on it just now (${describeError(error).message}) and keeps trying.`;
	}

	return (
		<li className="flex items-start gap-2 text-sm" aria-label={`Backup job ${job.jobId}`}>
			<span className="mt-0.5">{icon}</span>
			<span className="min-w-0 flex-1 break-words">{text}</span>
			{outcome && (
				<Button
					size="icon"
					variant="ghost"
					className="size-6"
					aria-label="Dismiss"
					title="Dismiss"
					onClick={onDismiss}
				>
					<XIcon className="size-4" />
				</Button>
			)}
		</li>
	);
}
