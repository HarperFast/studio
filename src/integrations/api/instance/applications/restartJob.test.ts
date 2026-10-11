import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DeployRolloutError,
	followRestartJob,
	readRestartJob,
	rolloutPollDelayMs,
	RolloutSnapshot,
} from './restartJob';

type InstanceClient = Parameters<typeof followRestartJob>[0]['instanceClient'];

// Fixtures follow the rows Harper writes: harper `server/jobs/jobProcess.ts:72-87` records the job, and
// `bin/restart.ts` builds both result shapes — `activated` (5.4+, :232/:235/:258/:260) and `replicated` (:363/:385/:397).
const certifiedActivation = {
	id: 'job-1',
	status: 'COMPLETE',
	message: 'Successfully completed job: job-1',
	result: {
		activated: [
			{ node: 'node-b', certification: 'certified', message: 'Successfully deployed: web, restarting Harper' },
			{ node: 'node-c', certification: 'uncertified', message: 'Successfully deployed: web, restarting Harper' },
		],
	},
};

const PEER_REJECTION = 'web was not deployed on this node: release 9b2e failed to load in its canary worker: '
	+ 'web.jsResource: Cannot find module ./missing.js. Deployment a3f8, the release it replaced, is live again. '
	+ 'Deploy a fix, or activate deployment 9b2e again once the cause is fixed.';

const rejectedActivation = {
	id: 'job-1',
	status: 'ERROR',
	message: {
		error: `Deployment 9b2e of web was not activated on 1 of 2 peer node(s): node-c (${PEER_REJECTION})`,
		activated: [
			{ node: 'node-b', certification: 'certified', message: 'Successfully deployed: web, restarting Harper' },
			{ node: 'node-c', error: PEER_REJECTION },
		],
	},
};

const legacyRestart = {
	id: 'job-1',
	status: 'COMPLETE',
	message: 'Successfully completed job: job-1',
	result: {
		replicated: [
			{ node: 'node-b', message: 'Successfully completed job: peer-job-b' },
			{ node: 'node-c', message: 'connect ECONNREFUSED 10.0.0.3:9933' },
		],
	},
};

describe('readRestartJob', () => {
	it('keeps following a job that has not ended', () => {
		expect(readRestartJob('job-1', { id: 'job-1', status: 'CREATED' }).state).toBe('following');
		expect(readRestartJob('job-1', { id: 'job-1', status: 'IN_PROGRESS' }).state).toBe('following');
	});

	it("reads each node's own certification from a 5.4 activation job", () => {
		expect(readRestartJob('job-1', certifiedActivation)).toEqual({
			jobId: 'job-1',
			state: 'complete',
			nodes: [
				{ node: 'node-b', outcome: 'activated', certification: 'certified' },
				{ node: 'node-c', outcome: 'activated', certification: 'uncertified' },
			],
		});
	});

	it('names the node that rejected the release, with its reason, when the activation job fails', () => {
		const snapshot = readRestartJob('job-1', rejectedActivation);
		expect(snapshot.state).toBe('failed');
		expect(snapshot.nodes).toEqual([
			{ node: 'node-b', outcome: 'activated', certification: 'certified' },
			{ node: 'node-c', outcome: 'failed', detail: PEER_REJECTION },
		]);
		expect(snapshot.message).toBe(rejectedActivation.message.error);
	});

	it('does not read a node the legacy restart job could not reach as restarted, though the job completes', () => {
		expect(readRestartJob('job-1', legacyRestart)).toEqual({
			jobId: 'job-1',
			state: 'complete',
			nodes: [
				{ node: 'node-b', outcome: 'restarted' },
				{ node: 'node-c', outcome: 'unconfirmed', detail: 'connect ECONNREFUSED 10.0.0.3:9933' },
			],
		});
	});

	it("fails with the legacy job's text when a peer's restart failed", () => {
		expect(
			readRestartJob('job-1', {
				id: 'job-1',
				status: 'ERROR',
				message: 'Timed out waiting for restart job to complete',
			}),
		)
			.toEqual({
				jobId: 'job-1',
				state: 'failed',
				nodes: [],
				message: 'Timed out waiting for restart job to complete',
			});
	});

	it('reads a single instance, which has no other nodes, as complete', () => {
		const snapshot = readRestartJob('job-1', { id: 'job-1', status: 'COMPLETE', result: { replicated: [] } });
		expect(snapshot).toEqual({ jobId: 'job-1', state: 'complete', nodes: [] });
	});

	it.each([
		['entries that are not objects', { status: 'COMPLETE', result: { activated: [null, 3, 'x'] } }, 'complete'],
		['an ERROR with no message', { status: 'ERROR' }, 'failed'],
		['a status in another case', { status: 'complete', result: { replicated: [] } }, 'complete'],
		['no status at all', {}, 'following'],
	])('never throws on %s', (_label, job, state) => {
		expect(readRestartJob('job-1', { id: 'job-1', ...job } as never).state).toBe(state);
	});

	it.each([
		['no result', { status: 'COMPLETE', message: 'Successfully completed job: job-1' }],
		['a result that is not an object', { status: 'COMPLETE', result: 'done' }],
		['a result in neither shape', { status: 'COMPLETE', result: { restarted: ['node-b'] } }],
		['a non-array activated list', { status: 'COMPLETE', result: { activated: 'node-b' } }],
	])('does not read a finished job with %s as a successful rollout', (_label, job) => {
		expect(readRestartJob('job-1', { id: 'job-1', ...job } as never)).toEqual({
			jobId: 'job-1',
			state: 'unfollowable',
			nodes: [],
			unfollowable: 'unrecognized',
		});
	});

	it('names an entry with no node rather than dropping it', () => {
		const snapshot = readRestartJob('job-1', {
			id: 'job-1',
			status: 'ERROR',
			message: { activated: [{ error: 'boom' }] },
		});
		expect(snapshot.nodes).toEqual([{ node: 'unknown node', outcome: 'failed', detail: 'boom' }]);
		expect(snapshot.message).toBe('The restart job failed.');
	});
});

function httpError(status: number) {
	const error = new AxiosError(`Request failed with status code ${status}`);
	error.response = { status } as AxiosError['response'];
	return error;
}

type Answer = { job: object } | { rows: [] } | { reject: unknown };

function makeClient(answers: Answer[]) {
	let call = 0;
	const post = vi.fn(() => {
		const answer = answers[Math.min(call, answers.length - 1)];
		call += 1;
		if ('reject' in answer) {
			return Promise.reject(answer.reject);
		}
		return Promise.resolve({ data: 'rows' in answer ? [] : [answer.job] });
	});
	return { post, client: { post } as unknown as InstanceClient };
}

describe('followRestartJob', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('polls get_job for that id until the job ends, reporting each snapshot', async () => {
		const { post, client } = makeClient([
			{ job: { id: 'job-1', status: 'IN_PROGRESS' } },
			{ job: { id: 'job-1', status: 'IN_PROGRESS' } },
			{ job: certifiedActivation },
		]);
		const updates: RolloutSnapshot[] = [];
		const pending = followRestartJob({ instanceClient: client, jobId: 'job-1', onUpdate: (s) => updates.push(s) });
		await vi.advanceTimersByTimeAsync(10_000);
		const snapshot = await pending;
		expect(snapshot.state).toBe('complete');
		expect(post).toHaveBeenCalledTimes(3);
		expect(post).toHaveBeenCalledWith('/', { operation: 'get_job', id: 'job-1' }, undefined);
		expect(updates.map((s) => s.state)).toEqual(['following', 'complete']);
	});

	it('keeps polling through dropped connections and 5xx while a node restarts', async () => {
		const { client } = makeClient([
			{ reject: new AxiosError('Network Error', 'ERR_NETWORK') },
			{ reject: httpError(502) },
			{ reject: httpError(503) },
			{ job: legacyRestart },
		]);
		const pending = followRestartJob({ instanceClient: client, jobId: 'job-1' });
		await vi.advanceTimersByTimeAsync(10_000);
		expect((await pending).state).toBe('complete');
	});

	it.each([400, 403])('stops following on a %s, which it would only get again', async (status) => {
		const { post, client } = makeClient([{ reject: httpError(status) }]);
		const snapshot = await followRestartJob({ instanceClient: client, jobId: 'job-1' });
		expect(snapshot).toMatchObject({ state: 'unfollowable', unfollowable: 'refused' });
		expect(post).toHaveBeenCalledOnce();
	});

	it('gives up on a job the node it reaches does not have, but only once it has stayed missing', async () => {
		const { client } = makeClient([{ rows: [] }]);
		let settled: RolloutSnapshot | undefined;
		void followRestartJob({ instanceClient: client, jobId: 'job-1' }).then((s) => (settled = s));
		await vi.advanceTimersByTimeAsync(18_000);
		expect(settled).toBeUndefined();
		await vi.advanceTimersByTimeAsync(4_000);
		expect(settled).toMatchObject({ state: 'unfollowable', unfollowable: 'not-found' });
	});

	it('forgives a miss once the node that has the job answers again', async () => {
		const { client } = makeClient([
			{ rows: [] },
			...Array.from({ length: 8 }, () => ({ rows: [] }) as Answer),
			{ job: { id: 'job-1', status: 'IN_PROGRESS' } },
			...Array.from({ length: 8 }, () => ({ rows: [] }) as Answer),
			{ job: certifiedActivation },
		]);
		const pending = followRestartJob({ instanceClient: client, jobId: 'job-1' });
		await vi.advanceTimersByTimeAsync(60_000);
		expect((await pending).state).toBe('complete');
	});

	it('stops at its ceiling without claiming the job ended', async () => {
		const { client } = makeClient([{ job: { id: 'job-1', status: 'IN_PROGRESS' } }]);
		const pending = followRestartJob({ instanceClient: client, jobId: 'job-1', timeoutMs: 120_000 });
		await vi.advanceTimersByTimeAsync(130_000);
		expect(await pending).toMatchObject({ state: 'unfollowable', unfollowable: 'timed-out' });
	});

	it('slows down after the first minute instead of polling every 2s for half an hour', async () => {
		expect(rolloutPollDelayMs(0, 2_000)).toBe(2_000);
		expect(rolloutPollDelayMs(59_999, 2_000)).toBe(2_000);
		expect(rolloutPollDelayMs(60_000, 2_000)).toBe(5_000);
		expect(rolloutPollDelayMs(5 * 60_000, 2_000)).toBe(15_000);

		const { post, client } = makeClient([{ job: { id: 'job-1', status: 'IN_PROGRESS' } }]);
		void followRestartJob({ instanceClient: client, jobId: 'job-1' });
		await vi.advanceTimersByTimeAsync(30 * 60_000);
		// 30 in the first minute, 48 over the next four, 100 over the last 25.
		expect(post.mock.calls.length).toBeLessThan(200);
	});

	it('rejects, without reporting the outcome, when its signal aborts while a poll is in flight', async () => {
		let answer: (value: { data: object[] }) => void = () => {};
		const post = vi.fn((_url: string, _body: object, config?: { signal?: AbortSignal }) => {
			expect(config?.signal).toBeInstanceOf(AbortSignal);
			return new Promise<{ data: object[] }>((resolve) => (answer = resolve));
		});
		const controller = new AbortController();
		const updates: RolloutSnapshot[] = [];
		const pending = followRestartJob({
			instanceClient: { post } as unknown as InstanceClient,
			jobId: 'job-1',
			signal: controller.signal,
			onUpdate: (s) => updates.push(s),
		});
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(0);
		controller.abort(new Error('cancelled'));
		answer({ data: [certifiedActivation] });
		await expect(pending).rejects.toThrow('cancelled');
		expect(updates.map((s) => s.state)).toEqual(['following']);
	});

	it('rejects when its signal aborts', async () => {
		const { client } = makeClient([{ job: { id: 'job-1', status: 'IN_PROGRESS' } }]);
		const controller = new AbortController();
		const pending = followRestartJob({ instanceClient: client, jobId: 'job-1', signal: controller.signal });
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(3_000);
		controller.abort(new Error('cancelled'));
		await vi.advanceTimersByTimeAsync(3_000);
		await expect(pending).rejects.toThrow('cancelled');
	});
});

describe('DeployRolloutError', () => {
	it("carries the job's own text, which names each node that did not take the release", () => {
		const rollout = readRestartJob('job-1', rejectedActivation);
		const error = new DeployRolloutError(rollout, '9b2e');
		expect(error.message).toBe(rejectedActivation.message.error);
		expect(error.deploymentId).toBe('9b2e');
		expect(error.rollout).toBe(rollout);
	});

	it('names the failed nodes itself when the job left no text', () => {
		const error = new DeployRolloutError({
			jobId: 'job-1',
			state: 'failed',
			nodes: [{ node: 'node-c', outcome: 'failed', detail: 'boom' }],
		});
		expect(error.message).toBe('Not every node took this release: node-c.');
	});
});
