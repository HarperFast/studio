import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { errorText } from '@/lib/errorText';

export interface HarperJob {
	id: string;
	/** Lifecycle: CREATED → IN_PROGRESS → COMPLETE | ERROR. */
	status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETE' | 'ERROR' | string;
	/**
	 * Usually text. From Harper 5.3.0 a job that fails with a structured report — a refused bulk load's
	 * permission report, a rolling activation's per-node outcomes — records the report object here.
	 */
	message?: unknown;
	/** What a job that returned an object finished with; its `message` is then a generic sentence. */
	result?: unknown;
	job_body?: unknown;
}

export async function getJob(
	{ jobId, instanceClient, signal }: { jobId: string; signal?: AbortSignal } & InstanceClientConfig,
) {
	const { data } = await instanceClient.post<HarperJob[]>('/', {
		operation: 'get_job',
		id: jobId,
	}, signal ? { signal } : undefined);
	return data?.[0];
}

/** A load job Harper finished with `ERROR`. Datadog withholds its message by this `name`. */
export class ImportJobError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImportJobError';
	}
}

// `hdb_job` does not replicate, so a cluster's address can answer `[]` from a node other than the one that
// ran the job, and reach that one again on the next request: a missing row only counts once it has stayed
// missing for a while.
export const JOB_NOT_FOUND_GRACE_MS = 20_000;

type ImportJobUnconfirmedReason = 'polling-failed' | 'not-found' | 'deadline';

const UNCONFIRMED_MESSAGES: Record<Exclude<ImportJobUnconfirmedReason, 'polling-failed'>, string> = {
	'not-found': 'Stopped following the import job, which the node Studio reached does not have',
	deadline: 'Stopped following the import job at its deadline, before it reported how it ended',
};

export class ImportJobUnconfirmedError extends Error {
	readonly jobId: string;
	readonly reason: ImportJobUnconfirmedReason;

	constructor(jobId: string, reason: ImportJobUnconfirmedReason, cause?: unknown) {
		// The poll's text stays in the message because Datadog's `shouldKeepEvent` filters on it. The job id
		// stays out of it, so these group as one issue in Error Tracking.
		super(
			reason === 'polling-failed'
				? `Stopped following the import job, whose status could not be read: ${errorText(cause) ?? 'no answer'}`
				: UNCONFIRMED_MESSAGES[reason],
			{ cause },
		);
		this.name = 'ImportJobUnconfirmedError';
		this.jobId = jobId;
		this.reason = reason;
	}
}

const UNCONFIRMED_WHY: Record<ImportJobUnconfirmedReason, string> = {
	'polling-failed': "Studio could no longer read this import's job, so it can't tell how it ended.",
	'not-found': "Studio couldn't find this import's job on the node it reached, so it can't tell how it ended.",
	deadline: 'Studio stopped following this import before it could confirm how it ended.',
};

export function describeImportJobUnconfirmed({ jobId, reason }: ImportJobUnconfirmedError): string {
	const where = reason === 'not-found'
		? `look for job ${jobId} on the Jobs tab of each instance's Status page: only the node that ran it lists it.`
		: `also look for job ${jobId} on the Status page's Jobs tab.`;
	return `${UNCONFIRMED_WHY[reason]} It may still be running, or it may have finished. Check the table before you `
		+ `import this data again, or its rows may be added twice. If your role can list jobs, ${where}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rejects with {@link ImportJobError} only on an ERROR it read, and with {@link ImportJobUnconfirmedError}
 * whenever it stops following without COMPLETE or ERROR. `onUpdate` sees every job record a poll returns,
 * the finished one included.
 */
export async function waitForJob({
	jobId,
	instanceClient,
	pollIntervalMs = 1500,
	timeoutMs = 10 * 60 * 1000,
	onUpdate,
}: {
	jobId: string;
	pollIntervalMs?: number;
	timeoutMs?: number;
	onUpdate?: (job: HarperJob) => void;
} & InstanceClientConfig): Promise<HarperJob> {
	const deadline = Date.now() + timeoutMs;
	// A dropped poll shouldn't kill an import that is still running server-side, so
	// transient get_job failures are tolerated — but only a few in a row, so a persistent
	// problem (revoked token, instance gone) surfaces quickly instead of at the deadline.
	let consecutiveFailures = 0;
	let missingSince: number | undefined;
	for (;;) {
		let job: HarperJob | undefined;
		try {
			job = await getJob({ jobId, instanceClient });
			consecutiveFailures = 0;
			missingSince = job ? undefined : (missingSince ?? Date.now());
		} catch (err) {
			// An answer that never came is not a miss, so not-found needs an unbroken run of them.
			missingSince = undefined;
			consecutiveFailures += 1;
			// At the deadline too: the failed poll, not the clock, is what left the outcome unread.
			if (consecutiveFailures >= 5 || Date.now() >= deadline) {
				throw new ImportJobUnconfirmedError(jobId, 'polling-failed', err);
			}
		}
		if (job && onUpdate) {
			// An observer failure must not turn a load Harper completed into a reported failure, which
			// invites a duplicating retry.
			try {
				onUpdate(job);
			} catch (err) {
				console.debug('waitForJob onUpdate failed', err);
			}
		}
		// Only COMPLETE and ERROR are terminal: a freshly submitted job can still be
		// CREATED (no worker picked it up yet), so anything else means keep polling.
		const status = job?.status?.toUpperCase();
		if (status === 'ERROR') {
			throw new ImportJobError(errorText(job?.message) ?? 'The import job failed.');
		}
		if (status === 'COMPLETE' && job) {
			return job;
		}
		if (missingSince !== undefined && Date.now() - missingSince >= JOB_NOT_FOUND_GRACE_MS) {
			throw new ImportJobUnconfirmedError(jobId, 'not-found');
		}
		if (Date.now() >= deadline) {
			throw new ImportJobUnconfirmedError(jobId, 'deadline');
		}
		await sleep(pollIntervalMs);
	}
}
