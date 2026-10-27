import type { ClusterPreset } from '@/features/clusters/presets/clusterPresets';
import { presetSetupSteps, runPresetSetup } from '@/features/clusters/presets/runPresetSetup';
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

beforeEach(() => {
	vi.resetAllMocks();
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

describe('presetSetupSteps', () => {
	it('lists one step per component and then the config step', () => {
		expect(presetSetupSteps(preset).map((step) => step.id)).toEqual([
			'deploy:harper-redirects',
			'deploy:harper-analytics',
			'configure',
		]);
	});
});
