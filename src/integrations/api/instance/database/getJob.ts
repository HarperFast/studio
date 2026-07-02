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
	for (;;) {
		const job = await getJob({ jobId, instanceClient });
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
