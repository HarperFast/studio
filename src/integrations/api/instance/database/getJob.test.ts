import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForJob } from './getJob';

type InstanceClient = Parameters<typeof waitForJob>[0]['instanceClient'];

function makeClient(responses: ({ status: string; message?: string } | { reject: true })[]) {
	let call = 0;
	const post = vi.fn(() => {
		const job = responses[Math.min(call, responses.length - 1)];
		call += 1;
		if ('reject' in job) {
			return Promise.reject(new Error('network down'));
		}
		return Promise.resolve({ data: [{ id: 'job-1', ...job }] });
	});
	return { post } as unknown as InstanceClient;
}

describe('waitForJob', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('resolves once the job reaches COMPLETE', async () => {
		const instanceClient = makeClient([
			{ status: 'IN_PROGRESS' },
			{ status: 'IN_PROGRESS' },
			{ status: 'COMPLETE', message: 'successfully loaded 10 of 10 records' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		await vi.advanceTimersByTimeAsync(500);
		const job = await pending;
		expect(job.status).toBe('COMPLETE');
		expect(job.message).toContain('10 of 10');
	});

	it('keeps polling through CREATED — a job no worker has picked up yet is not done', async () => {
		const instanceClient = makeClient([
			{ status: 'CREATED' },
			{ status: 'IN_PROGRESS' },
			{ status: 'COMPLETE', message: 'done' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		await vi.advanceTimersByTimeAsync(500);
		const job = await pending;
		expect(job.status).toBe('COMPLETE');
	});

	it('rejects with the job message when the job errors', async () => {
		const instanceClient = makeClient([
			{ status: 'IN_PROGRESS' },
			{ status: 'ERROR', message: 'CSV was malformed' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		pending.catch(() => {}); // avoid unhandled rejection before the assertion below
		await vi.advanceTimersByTimeAsync(500);
		await expect(pending).rejects.toThrow('CSV was malformed');
	});

	it('tolerates transient get_job failures and keeps polling', async () => {
		const instanceClient = makeClient([
			{ status: 'IN_PROGRESS' },
			{ reject: true },
			{ reject: true },
			{ status: 'COMPLETE', message: 'done' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		await vi.advanceTimersByTimeAsync(1000);
		const job = await pending;
		expect(job.status).toBe('COMPLETE');
	});

	it('gives up after several consecutive get_job failures', async () => {
		const instanceClient = makeClient([{ reject: true }]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(2000);
		await expect(pending).rejects.toThrow('network down');
	});

	it('rejects when the job never finishes before the timeout', async () => {
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, timeoutMs: 1000 });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(2000);
		await expect(pending).rejects.toThrow(/Timed out/);
	});
});
