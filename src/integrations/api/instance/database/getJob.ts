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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls get_job until the job leaves IN_PROGRESS. Resolves with the finished job,
 * or rejects with the job's error message (ERROR status) or on timeout.
 */
export async function waitForJob({
	jobId,
	instanceClient,
	pollIntervalMs = 1500,
	timeoutMs = 10 * 60 * 1000,
}: {
	jobId: string;
	pollIntervalMs?: number;
	timeoutMs?: number;
} & InstanceClientConfig): Promise<HarperJob> {
	const deadline = Date.now() + timeoutMs;
	// A dropped poll shouldn't kill an import that is still running server-side, so
	// transient get_job failures are tolerated — but only a few in a row, so a persistent
	// problem (revoked token, instance gone) surfaces quickly instead of at the deadline.
	let consecutiveFailures = 0;
	for (;;) {
		let job: HarperJob | undefined;
		try {
			job = await getJob({ jobId, instanceClient });
			consecutiveFailures = 0;
		} catch (err) {
			consecutiveFailures += 1;
			if (consecutiveFailures >= 5) {
				throw err;
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
		if (Date.now() >= deadline) {
			throw new Error('Timed out waiting for the import job to finish. Check the table in a few minutes.');
		}
		await sleep(pollIntervalMs);
	}
}
