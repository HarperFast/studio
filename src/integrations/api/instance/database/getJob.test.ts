import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForJob } from './getJob';

type InstanceClient = Parameters<typeof waitForJob>[0]['instanceClient'];

function makeClient(responses: { status: string; message?: string }[]) {
	let call = 0;
	const post = vi.fn(() => {
		const job = responses[Math.min(call, responses.length - 1)];
		call += 1;
		return Promise.resolve({ data: [{ id: 'job-1', ...job }] });
	});
	return { post } as unknown as InstanceClient;
}

describe('waitForJob', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('resolves once the job leaves IN_PROGRESS', async () => {
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

	it('rejects when the job never finishes before the timeout', async () => {
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, timeoutMs: 1000 });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(2000);
		await expect(pending).rejects.toThrow(/Timed out/);
	});
});
