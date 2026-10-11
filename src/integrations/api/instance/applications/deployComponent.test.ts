import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deployComponentStream', () => ({
	deployComponentStream: vi.fn(),
}));

import { SSEInconclusiveError, SSEOperationError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { deployAndFollowComponent, deployRequestBody, onDeployComponentSubmit } from './deployComponent';
import { deployComponentStream } from './deployComponentStream';
import { DeployRolloutError } from './restartJob';

const mockStream = vi.mocked(deployComponentStream);

function fakeClient(data: unknown) {
	return { post: vi.fn().mockResolvedValue({ data }) };
}

const baseArgs = {
	request: { kind: 'deploy' as const, project: 'my-app', package: 'npm:my-app' },
	entityId: 'ins-1' as const,
	entityType: 'instance' as const,
};

afterEach(() => {
	vi.clearAllMocks();
});

// Harper's validator decides these shapes: a stage refuses `restart` (harper `v5.3.0:components/operationsValidation.js:517-524`),
// and an activation refuses `package`, install options and `activate` alongside `deployment_id` (`:613-616`).
describe('deployRequestBody', () => {
	it('deploys with a rolling restart', () => {
		expect(deployRequestBody({ kind: 'deploy', project: 'web', package: 'npm:web', installCommand: 'npm ci' }, true))
			.toEqual({
				operation: 'deploy_component',
				package: 'npm:web',
				project: 'web',
				replicated: true,
				install_command: 'npm ci',
				restart: 'rolling',
			});
	});

	it('stages with activate: false and no restart', () => {
		const body = deployRequestBody({ kind: 'stage', project: 'web', package: 'npm:web' }, true);
		expect(body).toEqual({
			operation: 'deploy_component',
			package: 'npm:web',
			project: 'web',
			replicated: true,
			install_command: undefined,
			activate: false,
		});
		expect(body).not.toHaveProperty('restart');
	});

	it('activates by id alone, with a rolling restart and nothing to install', () => {
		const body = deployRequestBody({ kind: 'activate', project: 'web', deploymentId: 'a3f8c2d1' }, false);
		expect(body).toEqual({
			operation: 'deploy_component',
			project: 'web',
			deployment_id: 'a3f8c2d1',
			replicated: false,
			restart: 'rolling',
		});
		expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('package');
	});
});

describe('onDeployComponentSubmit', () => {
	it('stages through the buffered path exactly as built', async () => {
		const client = fakeClient({ message: 'Staged: my-app', staged: true, deployment_id: 'd1' });
		await onDeployComponentSubmit({
			...baseArgs,
			request: { kind: 'stage', project: 'my-app', package: 'npm:my-app' },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(client.post).toHaveBeenCalledWith(
			'/',
			expect.objectContaining({ activate: false, project: 'my-app', replicated: false }),
			{ timeout: 300_000 },
		);
		expect(client.post.mock.calls[0][1]).not.toHaveProperty('restart');
	});

	it('streams the same body it would post', async () => {
		mockStream.mockResolvedValue({ message: 'ok' });
		await onDeployComponentSubmit({
			...baseArgs,
			request: { kind: 'activate', project: 'my-app', deploymentId: 'd1' },
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: fakeClient({}) as any,
		});
		expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({
			body: deployRequestBody({ kind: 'activate', project: 'my-app', deploymentId: 'd1' }, false),
		}));
	});

	it('uses the buffered axios path when SSE is not requested', async () => {
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'buffered' });
		expect(client.post).toHaveBeenCalledOnce();
		expect(mockStream).not.toHaveBeenCalled();
	});

	it('returns the streamed result when SSE succeeds', async () => {
		mockStream.mockResolvedValue({ message: 'streamed', deployment_id: 'd1' });
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'streamed', deployment_id: 'd1' });
		// SSE succeeded → must NOT also POST (no double-deploy).
		expect(client.post).not.toHaveBeenCalled();
	});

	it.each([400, 401, 403, 404, 406, 413, 429])(
		'falls back to the buffered path when the stream was refused with a %i',
		async (status) => {
			mockStream.mockRejectedValue(new SSEUnsupportedError('no stream', { status }));
			const client = fakeClient({ message: 'buffered' });
			const result = await onDeployComponentSubmit({
				...baseArgs,
				useSSE: true,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				instanceClient: client as any,
			});
			expect(result).toEqual({ message: 'buffered' });
			expect(client.post).toHaveBeenCalledOnce();
		},
	);

	it.each([
		['a gateway 502', 502],
		['a gateway 503', 503],
		['a gateway 504', 504],
		['a Harper 500', 500],
		['a 2xx that is not a stream', 200],
		['no response at all', undefined],
	])('never sends the deploy again after %s, which can follow a deploy already running', async (_, status) => {
		const unsupported = new SSEUnsupportedError('no stream', { status });
		mockStream.mockRejectedValue(unsupported);
		const client = fakeClient({ message: 'buffered' });

		const error = await onDeployComponentSubmit({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(SSEInconclusiveError);
		expect((error as Error).cause).toBe(unsupported);
		expect(client.post).not.toHaveBeenCalled();
	});

	it('rethrows a deploy failure without re-POSTing (no double deploy)', async () => {
		mockStream.mockRejectedValue(new SSEOperationError('deploy failed'));
		const client = fakeClient({ message: 'buffered' });
		await expect(
			onDeployComponentSubmit({
				...baseArgs,
				useSSE: true,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				instanceClient: client as any,
			}),
		).rejects.toBeInstanceOf(SSEOperationError);
		expect(client.post).not.toHaveBeenCalled();
	});
});

describe('deployAndFollowComponent', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function rolloutClient(deployed: object, jobRows: object[][]) {
		let polls = 0;
		return vi.fn((_url: string, body: { operation: string }) => {
			if (body.operation === 'deploy_component') {
				return Promise.resolve({ data: deployed });
			}
			const rows = jobRows[Math.min(polls, jobRows.length - 1)];
			polls += 1;
			return Promise.resolve({ data: rows });
		});
	}

	it('does not poll anything for a deploy that handed no restart to a job', async () => {
		const post = rolloutClient({ message: 'Successfully deployed: my-app' }, []);
		const onEvent = vi.fn();
		const result = await deployAndFollowComponent({
			...baseArgs,
			onEvent,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: { post } as any,
		});
		expect(result).toEqual({ message: 'Successfully deployed: my-app' });
		expect(post).toHaveBeenCalledOnce();
		expect(onEvent).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('is not done until the restart job says how the other nodes took the release', async () => {
		const post = rolloutClient(
			{ message: 'Successfully deployed: my-app, activating it', deployment_id: 'd1', restartJobId: 'job-1' },
			[
				[{ id: 'job-1', status: 'IN_PROGRESS' }],
				[{ id: 'job-1', status: 'COMPLETE', result: { activated: [{ node: 'node-b', certification: 'certified' }] } }],
			],
		);
		const onEvent = vi.fn();
		let settled = false;
		const pending = deployAndFollowComponent({
			...baseArgs,
			onEvent,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: { post } as any,
		}).finally(() => (settled = true));
		await vi.advanceTimersByTimeAsync(0);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(5_000);
		const result = await pending;
		expect(result.rollout).toMatchObject({ state: 'complete', nodes: [{ node: 'node-b', outcome: 'activated' }] });
		expect(post).toHaveBeenCalledWith('/', { operation: 'get_job', id: 'job-1' }, undefined);
		expect(onEvent.mock.calls.map(([event]) => [event.type, event.data.state])).toEqual([
			['rollout', 'following'],
			['rollout', 'complete'],
		]);
	});

	it("fails as a rollout failure, keeping the deployment's id, when another node rejects the release", async () => {
		const post = rolloutClient({ message: 'ok', deployment_id: 'd1', restartJobId: 'job-1' }, [
			[{
				id: 'job-1',
				status: 'ERROR',
				message: { error: 'not activated on node-c', activated: [{ node: 'node-c', error: 'boom' }] },
			}],
		]);
		const pending = deployAndFollowComponent({
			...baseArgs,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: { post } as any,
		});
		pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(pending).rejects.toBeInstanceOf(DeployRolloutError);
		await expect(pending).rejects.toMatchObject({ message: 'not activated on node-c', deploymentId: 'd1' });
		// Following the job never deploys again.
		expect(post.mock.calls.filter(([, body]) => body.operation === 'deploy_component')).toHaveLength(1);
	});

	it('resolves an unfollowable rollout as unknown rather than as a success or a failure', async () => {
		const post = rolloutClient({ message: 'ok', restartJobId: 'job-1' }, [[]]);
		const pending = deployAndFollowComponent({
			...baseArgs,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: { post } as any,
		});
		await vi.advanceTimersByTimeAsync(30_000);
		expect((await pending).rollout).toMatchObject({ state: 'unfollowable', unfollowable: 'not-found' });
	});

	it('follows a streamed deploy the same way', async () => {
		mockStream.mockResolvedValue({ message: 'ok', restartJobId: 'job-1', certification: 'certified' });
		const post = rolloutClient({}, [[{ id: 'job-1', status: 'COMPLETE', result: { replicated: [] } }]]);
		const pending = deployAndFollowComponent({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: { post } as any,
		});
		await vi.advanceTimersByTimeAsync(1_000);
		const result = await pending;
		expect(result).toMatchObject({ certification: 'certified', rollout: { state: 'complete' } });
		expect(post.mock.calls.map(([, body]) => body.operation)).toEqual(['get_job']);
	});
});
