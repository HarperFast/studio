import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deployComponentStream', () => ({
	deployComponentStream: vi.fn(),
}));

import { SSEOperationError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { deployAndFollowComponent, onDeployComponentSubmit } from './deployComponent';
import { deployComponentStream } from './deployComponentStream';
import { DeployRolloutError } from './restartJob';

const mockStream = vi.mocked(deployComponentStream);

function fakeClient(data: unknown) {
	return { post: vi.fn().mockResolvedValue({ data }) };
}

const baseArgs = {
	applicationName: 'my-app',
	applicationUrl: 'npm:my-app',
	entityId: 'ins-1' as const,
	entityType: 'instance' as const,
};

afterEach(() => {
	vi.clearAllMocks();
});

describe('onDeployComponentSubmit', () => {
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

	it('falls back to the buffered path when the stream is unsupported', async () => {
		mockStream.mockRejectedValue(new SSEUnsupportedError('no stream'));
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'buffered' });
		expect(client.post).toHaveBeenCalledOnce();
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
		expect(post).toHaveBeenCalledWith('/', { operation: 'get_job', id: 'job-1' });
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
