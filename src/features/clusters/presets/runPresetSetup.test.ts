import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { getDeployMarks, markDeploy, resetDeployMarksForTests } from '@/features/clusters/presets/presetDeployMarks';
import {
	PresetDeployInFlightError,
	PresetInstallUnconfirmedError,
	presetSetupSteps,
	runPresetSetup,
	setupHoldsAcrossTabs,
} from '@/features/clusters/presets/runPresetSetup';
import { DeployRolloutError, type RolloutSnapshot } from '@/integrations/api/instance/applications/restartJob';
import { SSEInconclusiveError, SSEOperationError } from '@/integrations/api/sse/errors';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Only `get_configuration` goes through the client itself; every other operation is mocked above.
const post = vi.fn();
const instanceClient = { post } as unknown as AxiosInstance;

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

// Each test takes the real Web Locks under names of its own. Shared names would let a run that a failed
// assertion left holding the lock stall every later test, and Node shares its lock manager across the
// worker threads vitest runs files on.
const locks = navigator.locks;
beforeEach(() => {
	const scope = `${crypto.randomUUID()}:`;
	vi.stubGlobal('navigator', {
		locks: {
			request: (name: string, ...rest: unknown[]) => Reflect.apply(locks.request, locks, [scope + name, ...rest]),
		},
	});
	vi.resetAllMocks();
	resetDeployMarksForTests();
	getComponents.mockResolvedValue({ name: 'components', entries: [] });
	deployAndFollowComponent.mockResolvedValue({ message: 'ok' });
	listDeployments.mockResolvedValue({ deployments: [], total: 0 });
	getStudioConfiguration.mockResolvedValue({ navigation: {}, pages: [] });
	setConfiguration.mockResolvedValue({});
	post.mockResolvedValue({ data: {} });
});
afterEach(() => {
	vi.unstubAllGlobals();
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

	it('stops at a deploy still in flight, without offering to install it again beside it', async () => {
		listDeployments.mockResolvedValue(record({ status: 'replicating' }));
		const steps: string[] = [];
		const error = await runPresetSetup({
			instanceClient,
			entityId: 'clu-1',
			entityType: 'cluster',
			preset,
			onStep: (id, state, detail) => steps.push(`${id}:${state}:${detail}`),
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(PresetDeployInFlightError);
		expect(error).not.toBeInstanceOf(PresetInstallUnconfirmedError);
		expect(steps).toEqual([
			'deploy:harper-redirects:failed:A deploy of this component is still running (deployment d1, replicating). '
			+ 'Let it finish, then Retry. If it stays replicating, the deploy may have stopped part way: '
			+ 'redeploy the package from Applications, then Retry, or Skip for now.',
		]);
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
	});

	it('stops at a rolling deploy whose restart job it lost track of, which may still be activating', async () => {
		listDeployments.mockResolvedValue(record({ status: 'rolling_out', restart_job_id: 'j1' }));
		followRestartJob.mockResolvedValueOnce(rollout([], 'unfollowable'));
		await expect(run().promise).rejects.toBeInstanceOf(PresetDeployInFlightError);
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
	});

	it('waits out a rolling deploy with a peer that failed to stage before deploying it again', async () => {
		listDeployments.mockResolvedValue(
			record({ status: 'rolling_out', restart_job_id: 'j1', peer_results: [{ node: 'node-3', status: 'failed' }] }),
		);
		followRestartJob.mockResolvedValueOnce(rollout([{ node: 'node-2', outcome: 'activated' }]));
		await run().promise;
		expect(followRestartJob.mock.invocationCallOrder[0]).toBeLessThan(
			deployAndFollowComponent.mock.invocationCallOrder[0],
		);
		expect(deployedProjects()).toEqual(['harper-redirects', 'harper-analytics']);
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

describe('runPresetSetup on a component this browser marked and the cluster now lists', () => {
	beforeEach(() => {
		getComponents.mockResolvedValue(listed('harper-redirects'));
	});

	const deployedProjects = () => deployAndFollowComponent.mock.calls.map(([args]) => args.request.project);
	const marks = ['unconfirmed', 'partial'] as const;

	describe.each(marks)('as %s', (mark) => {
		beforeEach(() => {
			markDeploy('clu-1', 'harper-redirects', mark);
		});

		it.each(
			[
				['still installing', { status: 'installing' }, undefined],
				['rolling out under a job it lost track of', { status: 'rolling_out', restart_job_id: 'j1' }, 'unfollowable'],
			] as const,
		)(
			'never deploys beside its deploy %s, the tab that sent it having closed',
			async (_case, fields, followed) => {
				listDeployments.mockResolvedValue(record(fields));
				followRestartJob.mockResolvedValue(followed && rollout([], followed));
				const { promise, log } = run();
				await expect(promise).rejects.toBeInstanceOf(PresetDeployInFlightError);
				expect(log.at(-1)).toBe('deploy:harper-redirects:failed');
				expect(deployAndFollowComponent).not.toHaveBeenCalled();
				expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': mark });
			},
		);

		it.each(
			[
				[
					'ended on every node',
					{ status: 'success', peer_results: [{ node: 'node-2', status: 'success' }] },
					undefined,
				],
				['finished rolling out on every node', { status: 'rolling_out', restart_job_id: 'j1' }, 'activated'],
			] as const,
		)('leaves it alone and clears the mark once its deploy %s', async (_case, fields, outcome) => {
			listDeployments.mockResolvedValue(record(fields));
			followRestartJob.mockResolvedValue(outcome && rollout([{ node: 'node-2', outcome }]));
			const { promise, log } = run();
			await promise;
			expect(log.filter((entry) => entry.startsWith('deploy:harper-redirects:')).at(-1)).toBe(
				'deploy:harper-redirects:done',
			);
			expect(deployedProjects()).toEqual(['harper-analytics']);
			expect(getDeployMarks('clu-1')).toEqual({});
		});

		it.each([
			['no record of it', { deployments: [], total: 0 }],
			['a failed deploy', record({ status: 'failed' })],
			['a partial rollout', record({ status: 'partial' })],
			['a failed peer', record({ status: 'success', peer_results: [{ node: 'node-2', status: 'failed' }] })],
		])('deploys it again over %s', async (_case, answer) => {
			listDeployments.mockResolvedValue(answer);
			await run().promise;
			expect(deployedProjects()).toEqual(['harper-redirects', 'harper-analytics']);
			expect(getDeployMarks('clu-1')).toEqual({});
		});

		// What the stop tells the user to do when the record never moves, as Harper sweeps only `rolling_out`.
		it('goes on at Retry once a redeploy writes a newer record over one that never ended', async () => {
			listDeployments
				.mockResolvedValueOnce(record({ status: 'installing' }))
				.mockResolvedValueOnce(record({ deployment_id: 'd2', status: 'success' }));
			await expect(run().promise).rejects.toBeInstanceOf(PresetDeployInFlightError);
			await run().promise;
			expect(deployedProjects()).toEqual(['harper-analytics']);
			expect(getDeployMarks('clu-1')).toEqual({});
		});

		it('reads the deploy record on a single instance too, since its own deploy may still be running there', async () => {
			listDeployments.mockResolvedValue(record({ status: 'loading' }));
			await expect(run('instance').promise).rejects.toBeInstanceOf(PresetDeployInFlightError);
			expect(deployAndFollowComponent).not.toHaveBeenCalled();
		});
	});

	describe('after "Install again", which marks it partial', () => {
		const installAgain = () => markDeploy('clu-1', 'harper-redirects', 'partial');

		it('deploys a missing one without reading any record', async () => {
			getComponents.mockResolvedValue(listed());
			markDeploy('clu-1', 'harper-redirects', 'unconfirmed');
			await expect(run().promise).rejects.toBeInstanceOf(PresetInstallUnconfirmedError);

			installAgain();
			await run().promise;
			expect(listDeployments).not.toHaveBeenCalled();
			expect(deployedProjects()).toEqual(['harper-redirects', 'harper-analytics']);
		});

		it('still forces a deploy over a failed one', async () => {
			listDeployments.mockResolvedValue(record({ status: 'failed' }));
			installAgain();
			await run().promise;
			expect(deployedProjects()).toEqual(['harper-redirects', 'harper-analytics']);
		});

		it('never forces one beside a deploy still in flight', async () => {
			listDeployments.mockResolvedValue(record({ status: 'replicating' }));
			installAgain();
			await expect(run().promise).rejects.toBeInstanceOf(PresetDeployInFlightError);
			expect(deployAndFollowComponent).not.toHaveBeenCalled();
		});
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

describe('runPresetSetup redeploying a component the cluster lists', () => {
	beforeEach(() => {
		getComponents.mockResolvedValue(listed('harper-redirects'));
		markDeploy('clu-1', 'harper-redirects', 'partial');
	});

	const requests = () => deployAndFollowComponent.mock.calls.map(([args]) => args.request);

	it.each([
		['the databases it forks', ['data'] as string[] | true],
		['every database', true as string[] | true],
	])(
		'resends its private database copy setting for %s, which a deploy without it turns off',
		async (_case, setting) => {
			post.mockResolvedValue({
				data: { 'harper-redirects': { package: '@harperfast/redirects', branchedDatabases: setting } },
			});
			await run().promise;
			expect(post).toHaveBeenCalledWith('/', { operation: 'get_configuration' });
			expect(requests()[0]).toEqual({
				kind: 'deploy',
				project: 'harper-redirects',
				package: '@harperfast/redirects',
				branchedDatabases: setting,
			});
			expect(requests()[1].branchedDatabases).toBeUndefined();
		},
	);

	it('resends the install command it was deployed with, which a deploy without it drops', async () => {
		post.mockResolvedValue({
			data: { 'harper-redirects': { package: '@harperfast/redirects', install: { command: 'npm ci --omit=dev' } } },
		});
		await run().promise;
		expect(requests()[0]).toEqual({
			kind: 'deploy',
			project: 'harper-redirects',
			package: '@harperfast/redirects',
			installCommand: 'npm ci --omit=dev',
		});
	});

	it.each([
		['no install block', { package: '@harperfast/redirects' }],
		['an install block with only a timeout', { package: '@harperfast/redirects', install: { timeout: 60_000 } }],
		['a command that is not a string', { package: '@harperfast/redirects', install: { command: ['npm', 'ci'] } }],
		['an empty command', { package: '@harperfast/redirects', install: { command: '' } }],
	])('sends no install command for an entry with %s', async (_case, entry) => {
		post.mockResolvedValue({ data: { 'harper-redirects': entry } });
		await run().promise;
		expect(requests()[0].installCommand).toBeUndefined();
	});

	it('stops at the step when it cannot read the setting, rather than deploying without it', async () => {
		post.mockRejectedValueOnce(new Error('500'));
		const steps: string[] = [];
		const promise = runPresetSetup({
			instanceClient,
			entityId: 'clu-1',
			entityType: 'cluster',
			preset,
			onStep: (id, state, detail) => steps.push(`${id}:${state}:${detail}`),
		});
		await expect(promise).rejects.toThrow('500');
		expect(steps).toEqual([
			'deploy:harper-redirects:running:undefined',
			"deploy:harper-redirects:failed:Could not read this component's deploy settings: 500",
		]);
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
		expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
	});

	it('reads nothing for a first install, which has no setting to keep', async () => {
		getComponents.mockResolvedValue(listed());
		resetDeployMarksForTests();
		await run().promise;
		expect(post).not.toHaveBeenCalled();
		expect(requests().map((request) => request.branchedDatabases)).toEqual([undefined, undefined]);
	});
});

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((settle, fail) => {
		resolve = settle;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('runPresetSetup when the user leaves /setup', () => {
	function runAborted() {
		const controller = new AbortController();
		const log: string[] = [];
		const promise = runPresetSetup({
			instanceClient,
			entityId: 'clu-1',
			entityType: 'cluster',
			preset,
			signal: controller.signal,
			onStep: (id, state) => log.push(`${id}:${state}`),
		});
		// Settled up front, so the rejection is handled while the test arranges what comes next.
		const outcome = promise.then(() => 'resolved', (error: unknown) => (error as Error).name);
		return { abort: () => controller.abort(), log, outcome };
	}

	const sentNothing = () => {
		expect(deployAndFollowComponent).not.toHaveBeenCalled();
		expect(setConfiguration).not.toHaveBeenCalled();
	};

	it('stops waiting for the Web Lock at once, while another run still holds it', async () => {
		expect(setupHoldsAcrossTabs()).toBe(true);
		const first = deferred<{ message: string }>();
		deployAndFollowComponent.mockReturnValueOnce(first.promise);
		const holder = run();
		await vi.waitFor(() => expect(deployAndFollowComponent).toHaveBeenCalledTimes(1));

		const waiting = runAborted();
		waiting.abort();
		const stillWaiting = new Promise((resolve) => setTimeout(() => resolve('still waiting'), 50));
		expect(await Promise.race([waiting.outcome, stillWaiting])).toBe('AbortError');

		first.reject(answered(404));
		await expect(holder.promise).rejects.toThrow('404');
		expect(getComponents).toHaveBeenCalledTimes(1);
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);
		expect(setConfiguration).not.toHaveBeenCalled();
		expect(waiting.log).toEqual([]);
	});

	it('without Web Locks, sends nothing once the run ahead of it in this tab lets go', async () => {
		vi.stubGlobal('navigator', {});
		expect(setupHoldsAcrossTabs()).toBe(false);
		const first = deferred<{ message: string }>();
		deployAndFollowComponent.mockReturnValueOnce(first.promise);
		const holder = run();
		await vi.waitFor(() => expect(deployAndFollowComponent).toHaveBeenCalledTimes(1));

		const waiting = runAborted();
		waiting.abort();
		first.reject(answered(404));
		await expect(holder.promise).rejects.toThrow('404');
		expect(await waiting.outcome).toBe('AbortError');
		expect(getComponents).toHaveBeenCalledTimes(1);
		expect(deployAndFollowComponent).toHaveBeenCalledTimes(1);
		expect(setConfiguration).not.toHaveBeenCalled();
		expect(waiting.log).toEqual([]);
	});

	it('reports a components read that fails after the abort as the abort, not as a failed step', async () => {
		const read = deferred<never>();
		getComponents.mockReturnValueOnce(read.promise);
		const { abort, log, outcome } = runAborted();
		await vi.waitFor(() => expect(getComponents).toHaveBeenCalledTimes(1));
		abort();
		read.reject(new Error('canceled'));
		expect(await outcome).toBe('AbortError');
		expect(log).toEqual([]);
		sentNothing();
	});

	describe('during the deployment-record read', () => {
		beforeEach(() => {
			getComponents.mockResolvedValue(listed('harper-redirects'));
		});

		it.each([
			['ended failed, which would deploy it again', { status: 'failed' }],
			['is under a restart job, which would be followed', { status: 'success', restart_job_id: 'j1' }],
		])('sends nothing more when the record that arrives %s', async (_case, fields) => {
			const read = deferred<unknown>();
			listDeployments.mockReturnValueOnce(read.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(listDeployments).toHaveBeenCalledTimes(1));
			abort();
			read.resolve(record(fields));
			expect(await outcome).toBe('AbortError');
			expect(followRestartJob).not.toHaveBeenCalled();
			expect(post).not.toHaveBeenCalled();
			expect(log).toEqual([]);
			sentNothing();
		});

		it('reports a read that fails after the abort as the abort', async () => {
			const read = deferred<never>();
			listDeployments.mockReturnValueOnce(read.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(listDeployments).toHaveBeenCalledTimes(1));
			abort();
			read.reject(new Error('canceled'));
			expect(await outcome).toBe('AbortError');
			expect(log).toEqual([]);
			sentNothing();
		});

		it.each([
			['every node took it', rollout([{ node: 'node-2', outcome: 'restarted' }])],
			['a node may lack it', rollout([{ node: 'node-2', outcome: 'unconfirmed' }])],
		])('reports nothing once the restart job it followed answers that %s', async (_case, snapshot) => {
			listDeployments.mockResolvedValue(record({ status: 'success', restart_job_id: 'j1' }));
			const followed = deferred<RolloutSnapshot>();
			followRestartJob.mockReturnValueOnce(followed.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(followRestartJob).toHaveBeenCalledTimes(1));
			abort();
			followed.resolve(snapshot);
			expect(await outcome).toBe('AbortError');
			expect(log).toEqual(['deploy:harper-redirects:running']);
			sentNothing();
		});
	});

	describe("during the read of a listed component's deploy settings", () => {
		beforeEach(() => {
			getComponents.mockResolvedValue(listed('harper-redirects'));
			markDeploy('clu-1', 'harper-redirects', 'partial');
		});

		it('neither marks nor sends the deploy once the setting arrives', async () => {
			const read = deferred<unknown>();
			post.mockReturnValueOnce(read.promise);
			const { abort, outcome } = runAborted();
			await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
			abort();
			read.resolve({ data: {} });
			expect(await outcome).toBe('AbortError');
			expect(getDeployMarks('clu-1')).toEqual({ 'harper-redirects': 'partial' });
			sentNothing();
		});

		it('reports a read that fails after the abort as the abort', async () => {
			const read = deferred<never>();
			post.mockReturnValueOnce(read.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
			abort();
			read.reject(new Error('canceled'));
			expect(await outcome).toBe('AbortError');
			expect(log).toEqual(['deploy:harper-redirects:running']);
			sentNothing();
		});
	});

	describe("during the read of the cluster's Studio settings", () => {
		beforeEach(() => {
			getComponents.mockResolvedValue(listed('harper-redirects', 'harper-analytics'));
		});

		it('writes nothing once the settings arrive', async () => {
			const read = deferred<unknown>();
			getStudioConfiguration.mockReturnValueOnce(read.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(getStudioConfiguration).toHaveBeenCalledTimes(1));
			abort();
			read.resolve({ navigation: {}, pages: [] });
			expect(await outcome).toBe('AbortError');
			expect(log.at(-1)).toBe('configure:running');
			sentNothing();
		});

		it('reports a read that fails after the abort as the abort', async () => {
			const read = deferred<never>();
			getStudioConfiguration.mockReturnValueOnce(read.promise);
			const { abort, log, outcome } = runAborted();
			await vi.waitFor(() => expect(getStudioConfiguration).toHaveBeenCalledTimes(1));
			abort();
			read.reject(new Error('canceled'));
			expect(await outcome).toBe('AbortError');
			expect(log.at(-1)).toBe('configure:running');
			sentNothing();
		});
	});
});
