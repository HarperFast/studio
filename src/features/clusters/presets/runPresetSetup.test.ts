import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { getDeployMarks, resetDeployMarksForTests } from '@/features/clusters/presets/presetDeployMarks';
import {
	PresetInstallUnconfirmedError,
	presetSetupSteps,
	runPresetSetup,
} from '@/features/clusters/presets/runPresetSetup';
import { DeployRolloutError } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import type { AxiosInstance } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deployAndFollowComponent, getComponents, setConfiguration } = vi.hoisted(() => ({
	deployAndFollowComponent: vi.fn(),
	getComponents: vi.fn(),
	setConfiguration: vi.fn(),
}));
vi.mock('@/integrations/api/instance/applications/deployComponent', () => ({ deployAndFollowComponent }));
vi.mock('@/integrations/api/instance/applications/getComponents', () => ({ getComponents }));
vi.mock('@/integrations/api/instance/status/setConfiguration', () => ({ setConfiguration }));

const preset: ClusterPreset = {
	id: 'redirects',
	name: 'HTTP redirects',
	description: '',
	icon: 'signpost',
	components: [
		{ project: 'harper-redirects', package: '@harperfast/redirects' },
		{ project: 'harper-analytics', package: '@harperfast/analytics' },
	],
	studio: { navigation: { applications: 'hidden' }, landing: 'harper-redirects.redirects' },
};

const instanceClient = {} as AxiosInstance;

function run(entityType: 'cluster' | 'instance' = 'cluster') {
	const log: string[] = [];
	const promise = runPresetSetup({
		instanceClient,
		entityId: 'clu-1',
		entityType,
		preset,
		onStep: (id, state) => log.push(`${id}:${state}`),
	});
	return { promise, log };
}

const listed = (...names: string[]) => ({ name: 'components', entries: names.map((name) => ({ name, entries: [] })) });

beforeEach(() => {
	vi.resetAllMocks();
	resetDeployMarksForTests();
	getComponents.mockResolvedValue({ name: 'components', entries: [] });
	deployAndFollowComponent.mockResolvedValue({ message: 'ok' });
	setConfiguration.mockResolvedValue({});
});

describe('runPresetSetup', () => {
	it('deploys each component in order, then writes the studio block replicated', async () => {
		const { promise, log } = run();
		await promise;

		expect(deployAndFollowComponent.mock.calls.map(([args]) => args.request)).toEqual([
			{ kind: 'deploy', project: 'harper-redirects', package: '@harperfast/redirects' },
			{ kind: 'deploy', project: 'harper-analytics', package: '@harperfast/analytics' },
		]);
		expect(setConfiguration).toHaveBeenCalledWith({
			instanceClient,
			studio_navigation: { applications: 'hidden' },
			studio_landing: 'harper-redirects.redirects',
			replicated: true,
		});
		expect(log).toEqual([
			'deploy:harper-redirects:running',
			'deploy:harper-redirects:done',
			'deploy:harper-analytics:running',
			'deploy:harper-analytics:done',
			'configure:running',
			'configure:done',
		]);
	});

	it('does not ask a single instance to replicate', async () => {
		await run('instance').promise;
		expect(setConfiguration).toHaveBeenCalledWith({
			instanceClient,
			studio_navigation: { applications: 'hidden' },
			studio_landing: 'harper-redirects.redirects',
		});
	});

	it('leaves an already installed component alone, so Retry is safe', async () => {
		getComponents.mockResolvedValue({ name: 'components', entries: [{ name: 'harper-redirects', entries: [] }] });
		const { promise, log } = run();
		await promise;

		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);
		expect(log[0]).toBe('deploy:harper-redirects:done');
	});

	it('stops at a failed deploy without touching the config', async () => {
		deployAndFollowComponent.mockRejectedValueOnce(new Error('404 Not Found - @harperfast/redirects'));
		const { promise, log } = run();

		await expect(promise).rejects.toThrow('404');
		expect(log).toEqual(['deploy:harper-redirects:running', 'deploy:harper-redirects:failed']);
		expect(setConfiguration).not.toHaveBeenCalled();
	});

	it('stops before the next step once aborted, so leaving /setup sends nothing more', async () => {
		const controller = new AbortController();
		deployAndFollowComponent.mockImplementationOnce(async () => {
			controller.abort();
			return { message: 'ok' };
		});
		const log: string[] = [];
		const run = runPresetSetup({
			instanceClient,
			entityId: 'clu-1',
			entityType: 'cluster',
			preset,
			signal: controller.signal,
			onStep: (id, state) => log.push(`${id}:${state}`),
		});

		await expect(run).rejects.toThrow();
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);
		expect(setConfiguration).not.toHaveBeenCalled();
		expect(log).toEqual(['deploy:harper-redirects:running', 'deploy:harper-redirects:done']);
	});

	it('treats a rollout Studio could not follow as a failure', async () => {
		deployAndFollowComponent.mockResolvedValueOnce({ message: 'ok', rollout: { state: 'unfollowable' } });
		await expect(run().promise).rejects.toThrow(/could not confirm/);
		expect(setConfiguration).not.toHaveBeenCalled();
	});
});

describe('runPresetSetup when an outcome is uncertain', () => {
	it('never resends a missing install that may have started, and deploys it once more when it appears', async () => {
		deployAndFollowComponent.mockRejectedValueOnce(new SSEInconclusiveError('stream ended'));
		await expect(run().promise).rejects.toThrow('stream ended');
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'unconfirmed' });

		const retry = run();
		await expect(retry.promise).rejects.toBeInstanceOf(PresetInstallUnconfirmedError);
		expect(retry.log).toEqual(['deploy:harper-redirects:failed']);
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);

		// Listed on the node Studio reached says nothing of the others, so it goes out once more.
		getComponents.mockResolvedValue(listed('harper-redirects'));
		await run().promise;
		expect(deployAndFollowComponent.mock.calls.map(([args]) => args.request.project)).toEqual([
			'harper-redirects',
			'harper-redirects',
			'harper-analytics',
		]);
		expect(getDeployMarks('clu-1')).toEqual({});
	});

	it('redeploys after a failed rollout although the receiving node lists the component', async () => {
		const snapshot = { jobId: 'j1', state: 'failed' as const, nodes: [] };
		deployAndFollowComponent.mockRejectedValueOnce(new DeployRolloutError(snapshot));
		await expect(run().promise).rejects.toBeInstanceOf(DeployRolloutError);

		getComponents.mockResolvedValue(listed('harper-redirects'));
		await run().promise;
		expect(deployAndFollowComponent.mock.calls.map(([args]) => args.request.project)).toEqual([
			'harper-redirects',
			'harper-redirects',
			'harper-analytics',
		]);
	});

	it('marks a deploy before sending it, so another tab sees it in flight, and clears it on a definite answer', async () => {
		let reject: (error: Error) => void = () => undefined;
		deployAndFollowComponent.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)));
		const { promise } = run();
		await vi.waitFor(() => expect(deployAndFollowComponent).toHaveBeenCalledTimes(1));
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'unconfirmed' });

		reject(new Error('404 Not Found'));
		await expect(promise).rejects.toThrow('404');
		expect(getDeployMarks('clu-1')).toEqual({});
	});

	it('treats a rollout that finished with a peer it could not reach as partial', async () => {
		deployAndFollowComponent.mockResolvedValueOnce({
			message: 'ok',
			rollout: { jobId: 'j1', state: 'complete', nodes: [{ node: 'node-2', outcome: 'unconfirmed' }] },
		});
		await expect(run().promise).rejects.toThrow(/could not confirm every node/);
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
	});

	it('sends nothing when it cannot read what the cluster already has', async () => {
		getComponents.mockRejectedValueOnce(new Error('503'));
		await expect(run().promise).rejects.toThrow('503');
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
	});

	it('fails the settings step when a node refuses them', async () => {
		setConfiguration.mockResolvedValueOnce({
			message: 'ok',
			replicated: [{ node: 'node-2', reason: 'disk full', status: 'failed' }],
		});
		const { promise, log } = run();
		await expect(promise).rejects.toMatch(/node-2: disk full/);
		expect(log.at(-1)).toBe('configure:failed');
	});

	it('starts a second run only after the first settles, so a remount never deploys beside it', async () => {
		let finish: (value: { message: string }) => void = () => undefined;
		deployAndFollowComponent.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
		const first = run();
		const second = run();
		await vi.waitFor(() => expect(deployAndFollowComponent).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);

		getComponents.mockResolvedValue(listed('harper-redirects', 'harper-analytics'));
		finish({ message: 'ok' });
		await first.promise;
		await second.promise;
		expect(second.log).toContain('deploy:harper-redirects:done');
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(2);
	});
});

describe('presetSetupSteps', () => {
	it('lists one step per component and then the config step', () => {
		expect(presetSetupSteps(preset).map((step) => step.id)).toEqual([
			'deploy:harper-redirects',
			'deploy:harper-analytics',
			'configure',
		]);
	});
});
