import { shouldKeepEvent } from '@/integrations/datadog/shouldKeepEvent';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportJobError, ImportJobUnconfirmedError, JOB_NOT_FOUND_GRACE_MS, waitForJob } from './getJob';

type InstanceClient = Parameters<typeof waitForJob>[0]['instanceClient'];

function makeClient(responses: ({ status: string; message?: unknown } | { reject: true } | { missing: true })[]) {
	let call = 0;
	const post = vi.fn(() => {
		const job = responses[Math.min(call, responses.length - 1)];
		call += 1;
		if ('reject' in job) {
			return Promise.reject(new Error(`network down (poll ${call})`));
		}
		if ('missing' in job) {
			return Promise.resolve({ data: [] });
		}
		return Promise.resolve({ data: [{ id: 'job-1', ...job }] });
	});
	return { post } as unknown as InstanceClient;
}

async function rejectionOf(pending: Promise<unknown>): Promise<unknown> {
	return pending.then(() => expect.unreachable('expected a rejection'), (error: unknown) => error);
}

describe('waitForJob', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

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
		await expect(pending).rejects.toBeInstanceOf(ImportJobError);
	});

	// harper `server/jobs/jobProcess.ts:86` (5.3.0+) records a refused load's permission report as the message.
	it('reads a structured job message as text, never "[object Object]"', async () => {
		const report = {
			error: 'This operation is not authorized due to role restrictions and/or invalid database items',
			unauthorized_access: [{ database: 'data', table: 'dog', required_table_permissions: ['insert'] }],
		};
		const instanceClient = makeClient([{ status: 'ERROR', message: report }]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(100);
		await expect(pending).rejects.toThrow(JSON.stringify(report));
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

	it('stops following after five get_job failures in a row, as an unconfirmed outcome rather than a failure', async () => {
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }, { reject: true }]);
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 }));
		await vi.advanceTimersByTimeAsync(2000);

		const error = await pending;
		expect(error).toBeInstanceOf(ImportJobUnconfirmedError);
		expect(error).not.toBeInstanceOf(ImportJobError);
		expect(error).toMatchObject({ jobId: 'job-1', reason: 'polling-failed' });
		expect((error as Error).cause).toEqual(new Error('network down (poll 6)'));
		expect(instanceClient.post).toHaveBeenCalledTimes(6);
	});

	it('counts only failures in a row: a poll that answers starts the count again', async () => {
		const instanceClient = makeClient([
			...Array<{ reject: true }>(4).fill({ reject: true }),
			{ status: 'IN_PROGRESS' },
			...Array<{ reject: true }>(4).fill({ reject: true }),
			{ status: 'COMPLETE', message: 'done' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		await vi.advanceTimersByTimeAsync(2000);

		await expect(pending).resolves.toMatchObject({ status: 'COMPLETE' });
	});

	it.each(
		[
			['still running', { status: 'IN_PROGRESS' }],
			['still queued', { status: 'CREATED' }],
			['never found', { missing: true }],
		] as const,
	)('stops following at the deadline when the job is %s, as an unconfirmed outcome', async (_, job) => {
		const instanceClient = makeClient([job]);
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, timeoutMs: 1000 }));
		await vi.advanceTimersByTimeAsync(2000);

		const error = await pending;
		expect(error).toBeInstanceOf(ImportJobUnconfirmedError);
		expect(error).toMatchObject({ jobId: 'job-1', reason: 'deadline', cause: undefined });
	});

	it('stops following a job that stays missing, long before the deadline, as an unconfirmed outcome', async () => {
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }, { missing: true }]);
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 }));
		await vi.advanceTimersByTimeAsync(JOB_NOT_FOUND_GRACE_MS + 1000);

		const error = await Promise.race([pending, Promise.resolve('still following')]);
		expect(error).toBeInstanceOf(ImportJobUnconfirmedError);
		expect(error).toMatchObject({ jobId: 'job-1', reason: 'not-found', cause: undefined });
	});

	const missingFor = (ms: number) => Array<{ missing: true }>(ms / 100).fill({ missing: true });
	it.each(
		[
			['a poll that finds the job', { status: 'IN_PROGRESS' }],
			['a poll that fails', { reject: true }],
		] as const,
	)('starts the missing-job grace again after %s', async (_, between) => {
		const halfGrace = JOB_NOT_FOUND_GRACE_MS / 2;
		const instanceClient = makeClient([
			...missingFor(halfGrace + 5000),
			between,
			...missingFor(halfGrace + 5000),
			{ status: 'COMPLETE', message: 'done' },
		]);
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 });
		await vi.advanceTimersByTimeAsync(2 * JOB_NOT_FOUND_GRACE_MS + 5000);

		await expect(pending).resolves.toMatchObject({ status: 'COMPLETE' });
	});

	it('names the failed poll, not the clock, when the deadline passes while polls are failing', async () => {
		const instanceClient = makeClient([
			...Array<{ status: string }>(10).fill({ status: 'IN_PROGRESS' }),
			{ reject: true },
		]);
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, timeoutMs: 1000 }));
		await vi.advanceTimersByTimeAsync(2000);

		const error = await pending;
		expect(error).toMatchObject({ jobId: 'job-1', reason: 'polling-failed' });
		expect((error as Error).cause).toEqual(new Error('network down (poll 11)'));
	});

	it('reads the clock once per poll, so a failed poll just under the deadline is never reported as the deadline', async () => {
		const instanceClient = makeClient([{ reject: true }]);
		const clock = [0, 999, 1000];
		vi.spyOn(Date, 'now').mockImplementation(() => (clock.length > 1 ? clock.shift()! : clock[0]));
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, timeoutMs: 1000 }));
		await vi.advanceTimersByTimeAsync(500);

		const error = await pending;
		expect(error).toMatchObject({ jobId: 'job-1', reason: 'polling-failed' });
		expect((error as Error).cause).toEqual(new Error('network down (poll 2)'));
	});

	it('still reports an ERROR that follows failed polls as the failure it is', async () => {
		const instanceClient = makeClient([{ reject: true }, { reject: true }, { status: 'ERROR', message: 'bad row' }]);
		const pending = rejectionOf(waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100 }));
		await vi.advanceTimersByTimeAsync(1000);

		const error = await pending;
		expect(error).toBeInstanceOf(ImportJobError);
		expect(error).not.toBeInstanceOf(ImportJobUnconfirmedError);
	});

	it('reports every job record a poll returns, the finished one included, and skips a failed poll', async () => {
		const instanceClient = makeClient([
			{ status: 'CREATED' },
			{ reject: true },
			{ status: 'IN_PROGRESS' },
			{ status: 'COMPLETE', message: 'done' },
		]);
		const onUpdate = vi.fn();
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, onUpdate });
		await vi.advanceTimersByTimeAsync(1000);
		await pending;
		expect(onUpdate.mock.calls.map(([job]) => job.status)).toEqual(['CREATED', 'IN_PROGRESS', 'COMPLETE']);
	});

	it('shows the observer a structured failure as sent, then rejects with it as text', async () => {
		const report = { error: 'not authorized', unauthorized_access: [{ table: 'dog' }] };
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }, { status: 'ERROR', message: report }]);
		const onUpdate = vi.fn();
		const pending = waitForJob({ jobId: 'job-1', instanceClient, pollIntervalMs: 100, onUpdate });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(500);

		await expect(pending).rejects.toThrow(JSON.stringify(report));
		expect(onUpdate.mock.calls.map(([job]) => [job.status, job.message])).toEqual([
			['IN_PROGRESS', undefined],
			['ERROR', report],
		]);
	});

	it('still resolves when the observer throws, so a completed load is never reported as failed', async () => {
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
		const instanceClient = makeClient([{ status: 'IN_PROGRESS' }, { status: 'COMPLETE', message: 'done' }]);
		const pending = waitForJob({
			jobId: 'job-1',
			instanceClient,
			pollIntervalMs: 100,
			onUpdate: () => {
				throw new Error('toast exploded');
			},
		});
		await vi.advanceTimersByTimeAsync(500);
		await expect(pending).resolves.toMatchObject({ status: 'COMPLETE' });
		debug.mockRestore();
	});
});

describe('ImportJobUnconfirmedError', () => {
	function consoleEvent(error: Error) {
		return { type: 'error', error: { message: error.message, type: error.name, source: 'console' } };
	}
	const getJobFailure = (message: string, status?: number) =>
		new AxiosError(
			message,
			status ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ECONNABORTED,
			undefined,
			undefined,
			status
				? { status, statusText: '', headers: {}, config: {} as never, data: '<html>secret upstream page</html>' }
				: undefined,
		);

	it('reaches RUM, or not, exactly as the poll failure it wraps would', () => {
		const timeout = getJobFailure('timeout of 30000ms exceeded');
		const unauthorized = getJobFailure('Request failed with status code 401', 401);
		const gateway = getJobFailure('Request failed with status code 502', 502);
		const network = new AxiosError('Network Error', AxiosError.ERR_NETWORK);

		for (const pollFailure of [timeout, unauthorized, gateway, network]) {
			expect(shouldKeepEvent(consoleEvent(new ImportJobUnconfirmedError('job-1', 'polling-failed', pollFailure))))
				.toBe(shouldKeepEvent(consoleEvent(pollFailure)));
		}
		expect(shouldKeepEvent(consoleEvent(new ImportJobUnconfirmedError('job-1', 'polling-failed', timeout)))).toBe(
			false,
		);
		expect(shouldKeepEvent(consoleEvent(new ImportJobUnconfirmedError('job-1', 'deadline')))).toBe(true);
	});

	it("keeps the job id and the poll's response body out of its message", () => {
		const error = new ImportJobUnconfirmedError(
			'4f1c2a9e-job',
			'polling-failed',
			getJobFailure('Request failed with status code 502', 502),
		);

		expect(error.message).toBe(
			'Stopped following the import job, whose status could not be read: Request failed with status code 502',
		);
		expect(new ImportJobUnconfirmedError('4f1c2a9e-job', 'deadline').message).not.toContain('4f1c2a9e-job');
	});

	const circular: Record<string, unknown> = {};
	circular.self = circular;
	it.each([null, undefined, 'socket hang up', { code: 'E_SOMETHING' }, circular])('accepts any cause (%o)', (cause) => {
		const error = new ImportJobUnconfirmedError('job-1', 'polling-failed', cause);

		expect(error.cause).toBe(cause);
		expect(error.name).toBe('ImportJobUnconfirmedError');
		expect(error.message).toMatch(/^Stopped following the import job, whose status could not be read: /);
	});
});
