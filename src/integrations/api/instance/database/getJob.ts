import { InstanceClientConfig } from '@/config/instanceClientConfig';

export interface HarperJob {
	id: string;
	status: 'IN_PROGRESS' | 'COMPLETE' | 'ERROR' | string;
	message?: string;
	job_body?: unknown;
}

export async function getJob({ jobId, instanceClient }: { jobId: string } & InstanceClientConfig) {
	const { data } = await instanceClient.post<HarperJob[]>('/', {
		operation: 'get_job',
		id: jobId,
	});
	return data?.[0];
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
		const status = job?.status?.toUpperCase();
		if (job && status !== 'IN_PROGRESS') {
			if (status === 'ERROR') {
				throw new Error(job.message || 'The import job failed.');
			}
			return job;
		}
		if (Date.now() >= deadline) {
			throw new Error('Timed out waiting for the import job to finish. Check the table in a few minutes.');
		}
		await sleep(pollIntervalMs);
	}
}
