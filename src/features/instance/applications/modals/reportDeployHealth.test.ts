import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DeployComponentResult } from '@/integrations/api/instance/applications/deployComponentStream';
import { deployNotes, reportDeployOutcome } from './reportDeployHealth';

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
