import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
	deployNotes,
	reportDeployFailure,
	reportDeployOutcome,
	reportDeployResult,
	reportStaged,
} from './reportDeployHealth';

afterEach(() => {
	vi.clearAllMocks();
});

const healthy = vi.fn(async () => ({ level: 'healthy' as const }));

describe('reportDeployOutcome', () => {
	it("never runs the one-node health check, or reports success, when the other nodes' outcome is unknown", async () => {
		const result: DeployComponentResult = {
			message: 'Successfully deployed: web, restarting Harper',
			restartJobId: 'job-1',
			rollout: { jobId: 'job-1', state: 'unfollowable', nodes: [], unfollowable: 'not-found' },
		};
		expect(await reportDeployOutcome('web', result, healthy)).toBe(false);
		expect(healthy).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.warning).toHaveBeenCalledWith('web deployed on the node that received it', {
			description: expect.stringContaining("can't tell how the other nodes took the release"),
		});
	});

	it('reports health once every node took the release', async () => {
		const result: DeployComponentResult = {
			message: 'ok',
			certification: 'certified',
			rollout: { jobId: 'job-1', state: 'complete', nodes: [{ node: 'node-b', outcome: 'activated' }] },
		};
		expect(await reportDeployOutcome('web', result, healthy)).toBe(true);
		expect(toast.success).toHaveBeenCalledWith('web deployed and healthy', { description: undefined });
	});

	it('still verifies a deploy whose stream ended without saying', async () => {
		expect(await reportDeployOutcome('web', undefined, healthy)).toBe(true);
		expect(healthy).toHaveBeenCalledWith('web');
	});
});

describe('reportDeployResult', () => {
	const success = { title: 'Application web redeployed successfully' };
	const action = { label: 'View record', onClick: () => {} };

	it("replaces the loading toast with the caller's success, and links the record", () => {
		reportDeployResult('web', { message: 'ok', rollout: { jobId: 'j', state: 'complete', nodes: [] } }, success, {
			id: 't1',
			action,
		});
		expect(toast.success).toHaveBeenCalledWith(success.title, { id: 't1', action, description: undefined });
	});

	it('does not call a legacy rollout that left a node unconfirmed a success', () => {
		reportDeployResult('web', {
			message: 'ok',
			rollout: {
				jobId: 'j',
				state: 'complete',
				nodes: [{ node: 'node-c', outcome: 'unconfirmed', detail: 'connect ECONNREFUSED' }],
			},
		}, success);
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.warning).toHaveBeenCalledWith('web deployed with warnings', {
			description: 'The restart was not confirmed on node-c.',
		});
	});

	it('does not call a rollout it could not follow a success', () => {
		reportDeployResult('web', {
			message: 'ok',
			rollout: { jobId: 'j', state: 'unfollowable', nodes: [], unfollowable: 'refused' },
		}, success);
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.warning).toHaveBeenCalledWith('web deployed on the node that received it', {
			description: expect.stringContaining("couldn't read this deploy's restart job"),
		});
	});
});

describe('reportStaged', () => {
	it('names the staged release and says it is waiting, without a health check', () => {
		reportStaged('web', { message: 'Staged: web', staged: true, deployment_id: 'd1' }, { id: 't1' });
		expect(toast.success).toHaveBeenCalledWith('web staged', {
			id: 't1',
			description: 'Deployment d1 is installed on every node, waiting to be activated.',
		});
	});

	it('keeps a staged install difference as a warning', () => {
		reportStaged('web', { message: 'ok', deployment_id: 'd1', warnings: ['node-b installed npm:web@1.5.0'] });
		expect(toast.warning).toHaveBeenCalledWith('web staged with warnings', {
			description: 'Deployment d1 is installed on every node, waiting to be activated. node-b installed npm:web@1.5.0',
		});
	});
});

describe('reportDeployFailure', () => {
	it('says a rollout failure did not reach every node, not that nothing landed', () => {
		reportDeployFailure(
			'web',
			new DeployRolloutError({ jobId: 'j', state: 'failed', nodes: [], message: 'node-c rejected it' }),
			'activate',
		);
		expect(toast.error).toHaveBeenCalledWith('web did not reach every node', { description: 'node-c rejected it' });
	});

	it('says any other failure failed', () => {
		reportDeployFailure('web', new Error('404: no such deployment'), 'activate');
		expect(toast.error).toHaveBeenCalledWith('Failed to activate web', { description: '404: no such deployment' });
	});

	it('never calls an activation that got no verdict failed', () => {
		const sent = { method: 'post', data: '{"operation":"deploy_component"}' } as InternalAxiosRequestConfig;
		reportDeployFailure(
			'web',
			new AxiosError('timeout of 300000ms exceeded', AxiosError.ECONNABORTED, sent),
			'activate',
		);
		expect(toast.error).toHaveBeenCalledWith("Couldn't confirm web was activated", {
			description: UNANSWERED_WRITE_MESSAGE,
		});
	});
});

describe('deployNotes', () => {
	it('explains an unchecked release without calling it a problem', () => {
		const notes = deployNotes({ message: 'ok', certification: 'uncertified' });
		expect(notes.warn).toBe(false);
		expect(notes.lines).toEqual([expect.stringMatching(/^Not certified: It went out unchecked/)]);
	});

	it('flags warnings and nodes whose restart was not confirmed', () => {
		const notes = deployNotes({
			message: 'ok',
			warnings: ['Install fingerprints differ on node-b'],
			rollout: {
				jobId: 'job-1',
				state: 'complete',
				nodes: [
					{ node: 'node-b', outcome: 'restarted' },
					{ node: 'node-c', outcome: 'unconfirmed', detail: 'connect ECONNREFUSED' },
				],
			},
		});
		expect(notes).toEqual({
			lines: ['Install fingerprints differ on node-b', 'The restart was not confirmed on node-c.'],
			warn: true,
		});
	});

	it('has nothing to add for a version that reports none of it', () => {
		expect(deployNotes({ message: 'Successfully deployed: web' })).toEqual({ lines: [], warn: false });
	});
});
