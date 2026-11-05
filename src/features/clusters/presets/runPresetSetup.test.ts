import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { getDeployMarks, resetDeployMarksForTests } from '@/features/clusters/presets/presetDeployMarks';
import {
	PresetInstallUnconfirmedError,
	presetSetupSteps,
	runPresetSetup,
} from '@/features/clusters/presets/runPresetSetup';
import { DeployRolloutError, type RolloutSnapshot } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError, SSEOperationError } from '@/integrations/api/sse/errors';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	deployAndFollowComponent,
	followRestartJob,
	getComponents,
	getStudioConfiguration,
	listDeployments,
	setConfiguration,
} = vi.hoisted(() => ({
	deployAndFollowComponent: vi.fn(),
	followRestartJob: vi.fn(),
	getComponents: vi.fn(),
	getStudioConfiguration: vi.fn(),
	listDeployments: vi.fn(),
	setConfiguration: vi.fn(),
}));
vi.mock('@/integrations/api/instance/applications/deployComponent', () => ({ deployAndFollowComponent }));
vi.mock('@/integrations/api/instance/applications/getComponents', () => ({ getComponents }));
vi.mock('@/integrations/api/instance/applications/restartJob', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/applications/restartJob')>()),
	followRestartJob,
}));
vi.mock('@/integrations/api/instance/deployments/listDeployments', () => ({ listDeployments }));
vi.mock('@/integrations/api/instance/status/setConfiguration', () => ({ setConfiguration }));
vi.mock('@/integrations/api/instance/studio/getStudioConfiguration', () => ({ getStudioConfiguration }));

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
	listDeployments.mockResolvedValue({ deployments: [], total: 0 });
	getStudioConfiguration.mockResolvedValue({ navigation: {}, pages: [] });
	setConfiguration.mockResolvedValue({});
});

function answered(status: number, data: unknown = { error: 'refused' }) {
	const config = {
		method: 'post',
		data: JSON.stringify({ operation: 'deploy_component' }),
	} as InternalAxiosRequestConfig;
	return new AxiosError(`Request failed with status code ${status}`, undefined, config, undefined, {
		status,
		statusText: '',
		data,
		headers: {},
		config,
	});
}

const record = (fields: Record<string, unknown>) => ({
	deployments: [{ deployment_id: 'd1', project: 'harper-redirects', peer_results: [], ...fields }],
	total: 1,
});

const rollout = (nodes: RolloutSnapshot['nodes'], state: RolloutSnapshot['state'] = 'complete'): RolloutSnapshot => ({
	jobId: 'j1',
	state,
	nodes,
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

		reject(answered(404));
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

describe('runPresetSetup when a deploy fails', () => {
	const failedToReplicate = "Component 'harper-redirects' was deployed on the origin node but failed to replicate to 1 "
		+ 'of 2 peer node(s): node-2 (connection refused). See deployment d1 (get_deployment) for details.';

	it.each([
		['a 500 that failed to replicate', () => answered(500, { error: failedToReplicate, deployment_id: 'd1' })],
		['a streamed 500 that failed to replicate', () => new SSEOperationError(failedToReplicate, { code: 500 })],
		['a streamed failure with no status', () => new SSEOperationError('ENOENT', { code: 'ENOENT' })],
		['a failed rollout', () => new DeployRolloutError({ jobId: 'j1', state: 'failed', nodes: [] })],
	])('marks %s partial, so Retry deploys it again', async (_case, error) => {
		deployAndFollowComponent.mockRejectedValueOnce(error());
		await expect(run().promise).rejects.toThrow();
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
	});

	it.each([
		['a 404', () => answered(404)],
		['a streamed 400', () => new SSEOperationError('Invalid package', { code: 400 })],
	])('clears the mark on %s, which proves the deploy never started', async (_case, error) => {
		deployAndFollowComponent.mockRejectedValueOnce(error());
		await expect(run().promise).rejects.toThrow();
		expect(getDeployMarks('clu-1')).toEqual({});
	});

	it('keeps the mark unconfirmed on a 503, which may have been applied', async () => {
		deployAndFollowComponent.mockRejectedValueOnce(answered(503));
		await expect(run().promise).rejects.toThrow();
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'unconfirmed' });
	});
});

describe("runPresetSetup on a component the cluster lists but this browser didn't deploy", () => {
	beforeEach(() => {
		getComponents.mockResolvedValue(listed('harper-redirects'));
	});

	const deployedProjects = () => deployAndFollowComponent.mock.calls.map(([args]) => args.request.project);

	it('leaves one with no deploy record alone, since it was installed some other way', async () => {
		const { promise, log } = run();
		await promise;
		expect(listDeployments).toHaveBeenCalledWith(expect.objectContaining({ project: 'harper-redirects', limit: 1 }));
		expect(deployedProjects()).toEqual(['harper-analytics']);
		expect(log[0]).toBe('deploy:harper-redirects:done');
	});

	it('leaves one whose latest deploy reached every node alone', async () => {
		listDeployments.mockResolvedValue(
			record({ status: 'success', peer_results: [{ node: 'node-2', status: 'success' }] }),
		);
		await run().promise;
		expect(deployedProjects()).toEqual(['harper-analytics']);
		expect(followRestartJob).not.toHaveBeenCalled();
	});

	it.each([
		['restarted', rollout([{ node: 'node-2', outcome: 'restarted' }])],
		['activated', rollout([{ node: 'node-2', outcome: 'activated', certification: 'certified' }])],
	])("follows the latest deploy's restart job and leaves it alone once every node %s", async (_case, snapshot) => {
		listDeployments.mockResolvedValue(record({ status: 'success', restart_job_id: 'j1' }));
		followRestartJob.mockResolvedValueOnce(snapshot);
		await run().promise;
		expect(followRestartJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'j1', instanceClient }));
		expect(deployedProjects()).toEqual(['harper-analytics']);
	});

	it('follows a rolling deploy still activating, rather than deploying beside it', async () => {
		listDeployments.mockResolvedValue(record({ status: 'rolling_out', restart_job_id: 'j1' }));
		followRestartJob.mockResolvedValueOnce(rollout([{ node: 'node-2', outcome: 'activated' }]));
		await run().promise;
		expect(deployedProjects()).toEqual(['harper-analytics']);
	});

	it.each([
		['failed', { status: 'failed' }, undefined],
		['partial', { status: 'partial' }, undefined],
		['with a failed peer', { status: 'success', peer_results: [{ node: 'node-2', status: 'failed' }] }, undefined],
		[
			'with an unconfirmed node',
			{ status: 'success', restart_job_id: 'j1' },
			rollout([{ node: 'node-2', outcome: 'unconfirmed' }]),
		],
		['with a job Studio could not follow', { status: 'success', restart_job_id: 'j1' }, rollout([], 'unfollowable')],
		['with a failed job', { status: 'success', restart_job_id: 'j1' }, rollout([], 'failed')],
	])('deploys one whose latest deploy ended %s again', async (_case, fields, snapshot) => {
		listDeployments.mockResolvedValue(record(fields));
		followRestartJob.mockResolvedValue(snapshot);
		await run().promise;
		expect(deployedProjects()).toEqual(['harper-redirects', 'harper-analytics']);
	});

	it('stops at a deploy still in flight, which only an explicit Install again sends beside', async () => {
		listDeployments.mockResolvedValue(record({ status: 'replicating' }));
		const { promise, log } = run();
		await expect(promise).rejects.toBeInstanceOf(PresetInstallUnconfirmedError);
		expect(log).toEqual(['deploy:harper-redirects:failed']);
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
	});

	it('sends nothing when it cannot read the deploy record', async () => {
		listDeployments.mockRejectedValueOnce(new Error('503'));
		const steps: string[] = [];
		const promise = runPresetSetup({
			instanceClient,
			entityId: 'clu-1',
			entityType: 'cluster',
			preset,
			onStep: (id, state, detail) => steps.push(`${id}:${state}:${detail}`),
		});
		await expect(promise).rejects.toThrow('503');
		expect(steps).toEqual(['deploy:harper-redirects:failed:Could not read how this component was last deployed: 503']);
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
	});

	it('trusts the listing on a single instance, which has no other node', async () => {
		listDeployments.mockResolvedValue(record({ status: 'failed' }));
		await run('instance').promise;
		expect(listDeployments).not.toHaveBeenCalled();
		expect(deployedProjects()).toEqual(['harper-analytics']);
	});
});

describe("runPresetSetup with the cluster's own Studio settings", () => {
	it('keeps every tab the cluster placed and its landing page, adding only what it has not set', async () => {
		getStudioConfiguration.mockResolvedValue({
			navigation: { applications: 'visible', logs: 'hidden' },
			landing: 'databases',
			pages: [],
		});
		await run().promise;
		expect(getStudioConfiguration).toHaveBeenCalledWith({ instanceClient, entityId: 'clu-1' });
		expect(setConfiguration).toHaveBeenCalledWith({
			instanceClient,
			studio_navigation: { applications: 'visible', logs: 'hidden' },
			studio_landing: 'databases',
			replicated: true,
		});
	});

	it("lands on the preset's page when the cluster has no landing, never writing null", async () => {
		getStudioConfiguration.mockResolvedValue({ navigation: { logs: 'tucked' }, pages: [] });
		await run().promise;
		expect(setConfiguration).toHaveBeenCalledWith(expect.objectContaining({
			studio_navigation: { applications: 'hidden', logs: 'tucked' },
			studio_landing: 'harper-redirects.redirects',
		}));
	});

	it.each([
		['cannot be read', () => getStudioConfiguration.mockRejectedValueOnce(new Error('500'))],
		[
			'are unavailable',
			() => getStudioConfiguration.mockResolvedValueOnce({ navigation: {}, pages: [], unavailable: true }),
		],
	])('writes nothing when they %s', async (_case, arrange) => {
		arrange();
		const { promise, log } = run();
		await expect(promise).rejects.toThrow();
		expect(setConfiguration).not.toHaveBeenCalled();
		expect(log.at(-1)).toBe('configure:failed');
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
